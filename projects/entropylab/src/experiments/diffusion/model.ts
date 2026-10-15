import { bounded, shannonEntropy, type Random } from '../../utils/numbers';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
export interface Diffusion {
  particles: Particle[];
  time: number;
}
export const GRID = 10;

export function createDiffusion(count: number, rng: Random): Diffusion {
  return {
    time: 0,
    particles: Array.from({ length: bounded(count, 10, 2000, 600, true) }, () => {
      const angle = rng() * 2 * Math.PI;
      return {
        x: rng() * 0.49 + 0.005,
        y: rng() * 0.99 + 0.005,
        vx: Math.cos(angle),
        vy: Math.sin(angle),
      };
    }),
  };
}

/** Reflect arbitrary overshoots; closing the divider keeps particles on their current side. */
function reflect(position: number, velocity: number, low: number, high: number): [number, number] {
  if (position > low && position < high) return [position, velocity];
  const width = high - low;
  const phase = (((position - low) % (2 * width)) + 2 * width) % (2 * width);
  return phase < width ? [low + phase, velocity] : [high - (phase - width), -velocity];
}

export function stepDiffusion(state: Diffusion, dt: number, speed: number, divider: boolean): void {
  dt = bounded(dt, 0, 1, 0);
  speed = bounded(speed, 0, 1, 0.25);
  if (dt === 0) return;
  if (speed === 0) {
    state.time += dt;
    return;
  }
  for (const p of state.particles) {
    const left = p.x < 0.5;
    [p.x, p.vx] = reflect(
      p.x + p.vx * speed * dt,
      p.vx,
      divider && !left ? 0.5 : 0,
      divider && left ? 0.5 : 1,
    );
    [p.y, p.vy] = reflect(p.y + p.vy * speed * dt, p.vy, 0, 1);
  }
  state.time += dt;
}

export function diffusionStats(state: Diffusion) {
  const grid = new Array<number>(GRID * GRID).fill(0);
  const histogram = new Array<number>(GRID).fill(0);
  let left = 0;
  for (const p of state.particles) {
    const x = Math.min(GRID - 1, Math.floor(p.x * GRID));
    const y = Math.min(GRID - 1, Math.floor(p.y * GRID));
    grid[y * GRID + x]++;
    histogram[x]++;
    if (p.x < 0.5) left++;
  }
  return { entropy: shannonEntropy(grid), histogram, left, right: state.particles.length - left };
}
