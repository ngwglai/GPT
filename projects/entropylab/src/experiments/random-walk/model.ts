import { bounded, type Random } from '../../utils/numbers';

export interface Walker {
  x: number;
  y: number;
  trail: [number, number][];
}
export interface Walk {
  particles: Walker[];
  steps: number;
  stepLength: number;
}
export const TRAIL_LIMIT = 128;

export function createWalk(count: number, stepLength: number): Walk {
  return {
    steps: 0,
    stepLength: bounded(stepLength, 0.5, 5, 1),
    particles: Array.from({ length: bounded(count, 1, 512, 200, true) }, () => ({
      x: 0,
      y: 0,
      trail: [[0, 0]],
    })),
  };
}

/** Isotropic, independent fixed-length steps in an unbounded plane. */
export function stepWalk(state: Walk, rng: Random): void {
  for (const p of state.particles) {
    const angle = rng() * 2 * Math.PI;
    p.x += state.stepLength * Math.cos(angle);
    p.y += state.stepLength * Math.sin(angle);
    p.trail.push([p.x, p.y]);
    if (p.trail.length > TRAIL_LIMIT) p.trail.shift();
  }
  state.steps++;
}

export function walkStats(state: Walk) {
  const msd =
    state.particles.reduce((sum, p) => sum + p.x * p.x + p.y * p.y, 0) / state.particles.length;
  return { msd, theoretical: state.steps * state.stepLength ** 2 };
}
