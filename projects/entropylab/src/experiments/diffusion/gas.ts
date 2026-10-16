import { EventHeap } from './heap';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  m: number;
}
export const POSITION_TOLERANCE = 1e-10;
const TIME_TOLERANCE = 1e-12;
const WALL = 0,
  PAIR = 1,
  CROSS = 2;
export const MAX_EVENTS = 50_000;

/** Stable quadratic root for first contact. Positions are evaluated at the same time. */
export function contactTime(a: Particle, b: Particle, horizon: number): number {
  return relativeContact(b.x - a.x, b.y - a.y, b.vx - a.vx, b.vy - a.vy, a.r + b.r, horizon);
}

function relativeContact(
  dx: number,
  dy: number,
  vx: number,
  vy: number,
  radius: number,
  horizon: number,
): number {
  const dot = dx * vx + dy * vy;
  if (dot >= 0) return Infinity;
  const vv = vx * vx + vy * vy;
  if (vv === 0) return Infinity;
  const gap = dx * dx + dy * dy - radius * radius;
  if (gap <= 0) return 0;
  const discriminant = dot * dot - vv * gap;
  if (discriminant <= 0) return Infinity; // Grazing contact transfers no normal impulse.
  const t = gap / (-dot + Math.sqrt(discriminant));
  return t <= horizon ? Math.max(0, t) : Infinity;
}

/** e=1 impulse along the line of centers; tangential velocity is unchanged. */
export function elasticCollision(a: Particle, b: Particle): boolean {
  let dx = b.x - a.x,
    dy = b.y - a.y;
  let distance = Math.hypot(dx, dy);
  if (distance > a.r + b.r + POSITION_TOLERANCE) return false;
  if (distance === 0) {
    dx = a.vx - b.vx;
    dy = a.vy - b.vy;
    distance = Math.hypot(dx, dy);
    if (distance === 0) return false;
  }
  const nx = dx / distance,
    ny = dy / distance;
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn >= 0) return false;
  const impulse = (-2 * vn) / (1 / a.m + 1 / b.m);
  a.vx -= (impulse / a.m) * nx;
  a.vy -= (impulse / a.m) * ny;
  b.vx += (impulse / b.m) * nx;
  b.vy += (impulse / b.m) * ny;
  return true;
}

export function mechanics(particles: Particle[]) {
  let energy = 0,
    px = 0,
    py = 0,
    speed = 0,
    maxSpeed = 0;
  for (const p of particles) {
    const v = Math.hypot(p.vx, p.vy);
    energy += 0.5 * p.m * v * v;
    px += p.m * p.vx;
    py += p.m * p.vy;
    speed += v;
    maxSpeed = Math.max(maxSpeed, v);
  }
  return {
    energy,
    px,
    py,
    momentum: Math.hypot(px, py),
    meanSpeed: speed / Math.max(1, particles.length),
    maxSpeed,
  };
}

/** Event-driven hard disks inside a unit square. Cell crossings maintain a conservative broad phase. */
export class HardDiskGas {
  time = 0;
  collisions = 0;
  wallImpulseX = 0;
  wallImpulseY = 0;
  fault: string | null = null;
  notice: string | null = null;
  lastEvents = 0;
  lastCandidates = 0;
  lastStepTime = 0;
  readonly initialEnergy: number;
  private readonly gridSize: number;
  private readonly cellWidth: number;
  private readonly head: Int32Array;
  private readonly next: Int32Array;
  private readonly previous: Int32Array;
  private readonly cell: Int32Array;
  private readonly version: Uint32Array;
  private readonly last: Float64Array;
  private readonly side: Int8Array;
  private readonly backup: Float64Array;
  private readonly heap: EventHeap;
  private now = 0;
  private end = 0;
  private needsRepair = true;

  constructor(
    readonly particles: Particle[],
    public divider = true,
    readonly interactions = true,
    readonly eventLimit = MAX_EVENTS,
  ) {
    if (particles.length === 0 || particles.length > 2000)
      throw new RangeError('Particle count must be 1–2000');
    if (!Number.isInteger(eventLimit) || eventLimit < 1 || eventLimit > MAX_EVENTS)
      throw new RangeError('Invalid event budget');
    for (const p of particles) {
      if (
        ![p.x, p.y, p.vx, p.vy, p.r, p.m].every(Number.isFinite) ||
        p.r < 0.001 ||
        p.r > 0.1 ||
        p.m < 1e-6 ||
        p.m > 1e6 ||
        Math.hypot(p.vx, p.vy) > 1e4
      )
        throw new RangeError('Invalid disk');
    }
    const maxRadius = Math.max(...particles.map((p) => p.r));
    this.gridSize = Math.max(1, Math.floor(1 / (2 * maxRadius)));
    this.cellWidth = 1 / this.gridSize; // Width >= largest pair contact distance.
    this.head = new Int32Array(this.gridSize ** 2);
    this.next = new Int32Array(particles.length);
    this.previous = new Int32Array(particles.length);
    this.cell = new Int32Array(particles.length);
    this.version = new Uint32Array(particles.length);
    this.last = new Float64Array(particles.length);
    this.side = new Int8Array(particles.length);
    this.backup = new Float64Array(particles.length * 4);
    this.heap = new EventHeap(Math.min(262144, Math.max(4096, particles.length * 96)));
    particles.forEach((p, i) => {
      this.side[i] = p.x < 0.5 ? -1 : 1;
    });
    this.initialEnergy = mechanics(particles).energy;
  }

  private coordinate(x: number, velocity: number): number {
    const q = x / this.cellWidth,
      rounded = Math.round(q);
    const index =
      Math.abs(q - rounded) * this.cellWidth < POSITION_TOLERANCE / 16
        ? rounded - (velocity < 0 ? 1 : 0)
        : Math.floor(q);
    return Math.max(0, Math.min(this.gridSize - 1, index));
  }

  private cellAt(p: Particle): number {
    return this.coordinate(p.y, p.vy) * this.gridSize + this.coordinate(p.x, p.vx);
  }
  private insert(i: number, cell: number): void {
    const first = this.head[cell];
    this.previous[i] = -1;
    this.next[i] = first;
    if (first !== -1) this.previous[first] = i;
    this.head[cell] = i;
    this.cell[i] = cell;
  }
  private rebuild(): void {
    this.head.fill(-1);
    for (let i = 0; i < this.particles.length; i++) this.insert(i, this.cellAt(this.particles[i]));
  }
  private moveCell(i: number): void {
    const target = this.cellAt(this.particles[i]);
    if (target === this.cell[i]) return;
    const prev = this.previous[i],
      next = this.next[i];
    if (prev === -1) this.head[this.cell[i]] = next;
    else this.next[prev] = next;
    if (next !== -1) this.previous[next] = prev;
    this.insert(i, target);
  }
  private sync(i: number, t: number): void {
    const p = this.particles[i],
      dt = t - this.last[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    this.last[i] = t;
  }
  private push(t: number, i: number, j: number, kind: number): void {
    if (t > this.end || !Number.isFinite(t)) return;
    if (
      !this.heap.push(
        Math.min(this.end, Math.max(this.now, t)),
        i,
        j,
        kind,
        this.version[i],
        kind === PAIR ? this.version[j] : 0,
      )
    )
      this.fault = '事件队列达到上限；请降低数量、半径或初始速度后重置。';
  }

  private schedule(i: number, initial = false): void {
    const p = this.particles[i];
    const lowX = this.divider && this.side[i] > 0 ? 0.5 + p.r : p.r;
    const highX = this.divider && this.side[i] < 0 ? 0.5 - p.r : 1 - p.r;
    const tx = p.vx > 0 ? (highX - p.x) / p.vx : p.vx < 0 ? (lowX - p.x) / p.vx : Infinity;
    const ty = p.vy > 0 ? (1 - p.r - p.y) / p.vy : p.vy < 0 ? (p.r - p.y) / p.vy : Infinity;
    const wallTime = Math.min(tx, ty);
    this.push(
      this.now + wallTime,
      i,
      (Math.abs(tx - wallTime) <= TIME_TOLERANCE ? 1 : 0) |
        (Math.abs(ty - wallTime) <= TIME_TOLERANCE ? 2 : 0),
      WALL,
    );
    const col = this.cell[i] % this.gridSize,
      row = Math.floor(this.cell[i] / this.gridSize);
    const cx =
      p.vx > 0
        ? ((col + 1) * this.cellWidth - p.x) / p.vx
        : p.vx < 0
          ? (col * this.cellWidth - p.x) / p.vx
          : Infinity;
    const cy =
      p.vy > 0
        ? ((row + 1) * this.cellWidth - p.y) / p.vy
        : p.vy < 0
          ? (row * this.cellWidth - p.y) / p.vy
          : Infinity;
    const crossing = Math.min(cx, cy);
    if (crossing < wallTime - TIME_TOLERANCE) this.push(this.now + crossing, i, -1, CROSS);
    if (!this.interactions) return;
    for (let y = Math.max(0, row - 1); y <= Math.min(this.gridSize - 1, row + 1); y++) {
      for (let x = Math.max(0, col - 1); x <= Math.min(this.gridSize - 1, col + 1); x++) {
        for (let j = this.head[y * this.gridSize + x]; j !== -1; j = this.next[j]) {
          if (i === j || (initial && j < i) || (this.divider && this.side[i] !== this.side[j]))
            continue;
          const q = this.particles[j],
            dt = this.now - this.last[j];
          this.lastCandidates++;
          const time = relativeContact(
            q.x + q.vx * dt - p.x,
            q.y + q.vy * dt - p.y,
            q.vx - p.vx,
            q.vy - p.vy,
            p.r + q.r,
            this.end - this.now,
          );
          if (Number.isFinite(time)) this.push(this.now + time, i, j, PAIR);
        }
      }
    }
  }

  private reflect(i: number, axes: number): void {
    const p = this.particles[i];
    if (axes & 1) {
      this.wallImpulseX -= 2 * p.m * p.vx;
      p.vx = -p.vx;
    }
    if (axes & 2) {
      this.wallImpulseY -= 2 * p.m * p.vy;
      p.vy = -p.vy;
    }
  }

  /** Bounded geometric recovery for invalid initial contacts / inserting a zero-thickness divider.
   * No velocities are randomized or rescaled. Failure is reported, never advanced through. */
  private repair(): boolean {
    for (let iteration = 0; iteration < 128; iteration++) {
      let worst = 0;
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const low = this.divider && this.side[i] > 0 ? 0.5 + p.r : p.r;
        const high = this.divider && this.side[i] < 0 ? 0.5 - p.r : 1 - p.r;
        const x = Math.max(low, Math.min(high, p.x)),
          y = Math.max(p.r, Math.min(1 - p.r, p.y));
        worst = Math.max(worst, Math.abs(x - p.x), Math.abs(y - p.y));
        if ((p.x < low && p.vx < 0) || (p.x > high && p.vx > 0)) this.reflect(i, 1);
        if ((p.y < p.r && p.vy < 0) || (p.y > 1 - p.r && p.vy > 0)) this.reflect(i, 2);
        p.x = x;
        p.y = y;
      }
      if (this.interactions) {
        this.rebuild();
        for (let i = 0; i < this.particles.length; i++) {
          const p = this.particles[i],
            col = this.cell[i] % this.gridSize,
            row = Math.floor(this.cell[i] / this.gridSize);
          for (let y = Math.max(0, row - 1); y <= Math.min(this.gridSize - 1, row + 1); y++) {
            for (let x = Math.max(0, col - 1); x <= Math.min(this.gridSize - 1, col + 1); x++) {
              for (let j = this.head[y * this.gridSize + x]; j !== -1; j = this.next[j]) {
                if (j <= i || (this.divider && this.side[i] !== this.side[j])) continue;
                const q = this.particles[j];
                let dx = q.x - p.x,
                  dy = q.y - p.y;
                let distance = Math.hypot(dx, dy);
                const overlap = p.r + q.r - distance;
                worst = Math.max(worst, overlap);
                if (overlap <= POSITION_TOLERANCE / 4) continue;
                if (distance === 0) {
                  dx = 1;
                  dy = 0;
                  distance = 1;
                }
                const share = q.m / (p.m + q.m),
                  nx = dx / distance,
                  ny = dy / distance;
                p.x -= nx * overlap * share;
                p.y -= ny * overlap * share;
                q.x += nx * overlap * (1 - share);
                q.y += ny * overlap * (1 - share);
              }
            }
          }
        }
      }
      // A successful pass performs no pair projection; its final geometry is verified,
      // rather than accepting a pass that may have just introduced another tiny overlap.
      if (worst <= POSITION_TOLERANCE / 4) return true;
    }
    return false;
  }

  setDivider(closed: boolean): boolean {
    if (this.divider === closed) return true;
    this.notice = null;
    if (!closed) {
      this.divider = false;
      return true;
    }
    const px = this.wallImpulseX,
      py = this.wallImpulseY;
    this.particles.forEach((p, i) => {
      this.backup.set([p.x, p.y, p.vx, p.vy], i * 4);
      this.side[i] = p.x < 0.5 ? -1 : 1;
    });
    this.divider = true;
    if (this.repair()) {
      this.needsRepair = false;
      return true;
    }
    this.particles.forEach((p, i) => {
      p.x = this.backup[4 * i];
      p.y = this.backup[4 * i + 1];
      p.vx = this.backup[4 * i + 2];
      p.vy = this.backup[4 * i + 3];
    });
    this.wallImpulseX = px;
    this.wallImpulseY = py;
    this.divider = false;
    this.notice = '局部拥挤，隔板未能安全关闭；已保留开启状态，可稍后重试。';
    return false;
  }

  step(dt: number): void {
    this.lastEvents = 0;
    this.lastCandidates = 0;
    this.lastStepTime = 0;
    if (this.fault || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 1);
    if (this.needsRepair) {
      if (!this.repair()) {
        this.fault = '初态重叠无法在容差内消除，请降低密度并重置。';
        return;
      }
      this.needsRepair = false;
    }
    this.now = 0;
    this.end = dt;
    this.heap.size = 0;
    this.last.fill(0);
    this.rebuild();
    for (let i = 0; i < this.particles.length && !this.fault; i++) this.schedule(i, true);
    while (this.heap.size > 0 && !this.fault) {
      if (++this.lastEvents > this.eventLimit) {
        this.fault = '单步事件预算耗尽，已暂停；请降低密度或速度后重置。';
        break;
      }
      this.heap.pop();
      const h = this.heap,
        i = h.outI,
        j = h.outJ,
        kind = h.outKind;
      if (h.outVi !== this.version[i] || (kind === PAIR && h.outVj !== this.version[j])) continue;
      this.now = h.outTime;
      this.sync(i, this.now);
      if (kind === PAIR) {
        this.sync(j, this.now);
        if (elasticCollision(this.particles[i], this.particles[j])) this.collisions++;
        this.version[j]++;
        this.moveCell(j);
      } else if (kind === WALL) this.reflect(i, j);
      this.version[i]++;
      this.moveCell(i);
      this.schedule(i);
      if (kind === PAIR) this.schedule(j);
    }
    const reached = this.fault ? this.now : this.end;
    for (let i = 0; i < this.particles.length; i++) this.sync(i, reached);
    this.time += reached;
    this.lastStepTime = reached;
  }
}
