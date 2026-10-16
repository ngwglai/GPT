import { bounded, shannonEntropy, type Random } from '../../utils/numbers';
import { HardDiskGas, mechanics, type Particle } from './gas';

export { HardDiskGas, type Particle } from './gas';
export type Diffusion = HardDiskGas;
export const GRID = 10;
export const MAX_PARTICLES = 2000;
export const DEFAULT_PARTICLES = 500;
export const DEFAULT_RADIUS = 0.004;
export const FIXED_DT = 1 / 60;
export const SPEED_BINS = 16;

/** Left-half area fraction <= 30%; coupled count/radius validation, not a promise of close packing. */
export function maximumRadius(count: number): number {
  return Math.min(
    0.02,
    Math.sqrt(0.15 / (Math.PI * bounded(count, 10, MAX_PARTICLES, DEFAULT_PARTICLES, true))),
  );
}

export interface GasOptions {
  radius?: number;
  velocity?: number;
  interactions?: boolean;
  divider?: boolean;
}

export function createDiffusion(count: number, rng: Random, options: GasOptions = {}): Diffusion {
  count = bounded(count, 10, MAX_PARTICLES, DEFAULT_PARTICLES, true);
  const r = bounded(options.radius ?? DEFAULT_RADIUS, 0.002, maximumRadius(count), DEFAULT_RADIUS);
  const scale = bounded(options.velocity ?? 0.25, 0, 1, 0.25);
  const cols = Math.ceil(Math.sqrt(count / 2)),
    rows = Math.ceil(count / cols);
  const dx = 0.5 / cols,
    dy = 1 / rows;
  const jitter = Math.max(0, Math.min(dx, dy) - 2 * r) * 0.2;
  const sites = Array.from({ length: cols * rows }, (_, i) => i);
  for (let i = sites.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [sites[i], sites[j]] = [sites[j], sites[i]];
  }
  let meanX = 0,
    meanY = 0;
  const particles: Particle[] = sites.slice(0, count).map((site) => {
    const vx = 2 * rng() - 1,
      vy = 2 * rng() - 1;
    meanX += vx / count;
    meanY += vy / count;
    return {
      x: ((site % cols) + 0.5) * dx + (rng() - 0.5) * 2 * jitter,
      y: (Math.floor(site / cols) + 0.5) * dy + (rng() - 0.5) * 2 * jitter,
      vx,
      vy,
      r,
      m: 1,
    };
  });
  let squared = 0;
  for (const p of particles) {
    p.vx -= meanX;
    p.vy -= meanY;
    squared += p.vx ** 2 + p.vy ** 2;
  }
  // Uniform Cartesian velocity components, zero center-of-mass velocity, prescribed RMS speed.
  const factor = squared > 0 ? scale / Math.sqrt(squared / count) : 0;
  for (const p of particles) {
    p.vx *= factor;
    p.vy *= factor;
  }
  return new HardDiskGas(particles, options.divider ?? true, options.interactions ?? true);
}

export function stepDiffusion(state: Diffusion, dt: number, divider = state.divider): void {
  if (divider !== state.divider) state.setDivider(divider);
  state.step(dt);
}

export function diffusionStats(state: Diffusion) {
  const grid = new Array<number>(GRID * GRID).fill(0);
  const histogram = new Array<number>(GRID).fill(0);
  const speedHistogram = new Array<number>(SPEED_BINS).fill(0);
  const physics = mechanics(state.particles);
  // Energy-based, time-independent axis: no changing bins as the gas thermalizes.
  const speedMax = Math.max(
    0.01,
    3 * Math.sqrt((2 * state.initialEnergy) / state.particles.length),
  );
  let left = 0;
  for (const p of state.particles) {
    const x = Math.max(0, Math.min(GRID - 1, Math.floor(p.x * GRID)));
    const y = Math.max(0, Math.min(GRID - 1, Math.floor(p.y * GRID)));
    grid[y * GRID + x]++;
    histogram[x]++;
    speedHistogram[
      Math.min(SPEED_BINS - 1, Math.floor((Math.hypot(p.vx, p.vy) / speedMax) * SPEED_BINS))
    ]++;
    if (p.x < 0.5) left++;
  }
  return {
    entropy: shannonEntropy(grid),
    histogram,
    left,
    right: state.particles.length - left,
    ...physics,
    speedHistogram,
    speedMax,
    collisions: state.collisions,
    collisionFrequency: state.time > 0 ? state.collisions / state.time : 0,
    energyError:
      state.initialEnergy > 0 ? (physics.energy - state.initialEnergy) / state.initialEnergy : 0,
    wallImpulseX: state.wallImpulseX,
    wallImpulseY: state.wallImpulseY,
    events: state.lastEvents,
    candidates: state.lastCandidates,
    fault: state.fault,
    notice: state.notice,
    divider: state.divider,
  };
}
export type GasStats = ReturnType<typeof diffusionStats>;
