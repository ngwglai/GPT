import type { Vec, Rock, Run } from "./types";
import { LIMITS } from "../data/content";
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export function unit(x: number, y: number): Vec {
  const d = Math.hypot(x, y);
  return d ? { x: x / d, y: y / d } : { x: 1, y: 0 };
}
export function random(s: Run) {
  let t = (s.rng += 0x6d2b79f5);
  s.rng >>>= 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function move(
  body: Vec,
  dx: number,
  dy: number,
  r: number,
  rocks: Rock[],
) {
  body.x = clamp(body.x + dx, r, LIMITS.world - r);
  body.y = clamp(body.y + dy, r, LIMITS.world - r);
  for (const o of rocks) {
    const d = distance(body, o);
    if (d < r + o.r) {
      const n = unit(body.x - o.x, body.y - o.y);
      body.x = o.x + n.x * (r + o.r);
      body.y = o.y + n.y * (r + o.r);
    }
  }
  body.x = clamp(body.x, r, LIMITS.world - r);
  body.y = clamp(body.y, r, LIMITS.world - r);
}
export class SpatialHash<T extends Vec> {
  private cells = new Map<string, T[]>();
  constructor(private size = 128) {}
  rebuild(items: T[]) {
    this.cells.clear();
    for (const item of items) {
      const k = `${Math.floor(item.x / this.size)},${Math.floor(item.y / this.size)}`;
      const cell = this.cells.get(k);
      if (cell) cell.push(item);
      else this.cells.set(k, [item]);
    }
  }
  nearby(p: Vec, r: number) {
    const out: T[] = [];
    for (
      let y = Math.floor((p.y - r) / this.size);
      y <= Math.floor((p.y + r) / this.size);
      y++
    )
      for (
        let x = Math.floor((p.x - r) / this.size);
        x <= Math.floor((p.x + r) / this.size);
        x++
      ) {
        const cell = this.cells.get(`${x},${y}`);
        if (cell) out.push(...cell);
      }
    return out;
  }
}
export function closest<T extends Vec & { hp: number }>(
  p: Vec,
  items: T[],
  range: number,
): T | undefined {
  let best: T | undefined;
  let d = range;
  for (const e of items) {
    const n = distance(p, e);
    if (e.hp > 0 && n < d) {
      best = e;
      d = n;
    }
  }
  return best;
}
export function segmentDistance(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = clamp(
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      0,
      1,
    );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
