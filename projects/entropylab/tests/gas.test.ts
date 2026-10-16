import { describe, expect, it } from 'vitest';
import {
  contactTime,
  elasticCollision,
  HardDiskGas,
  mechanics,
  POSITION_TOLERANCE,
  type Particle,
} from '../src/experiments/diffusion/gas';
import {
  createDiffusion,
  diffusionStats,
  FIXED_DT,
  maximumRadius,
} from '../src/experiments/diffusion/model';
import { seededRandom } from '../src/utils/numbers';
const disk = (x: number, y: number, vx = 0, vy = 0, r = 0.02, m = 1): Particle => ({
  x,
  y,
  vx,
  vy,
  r,
  m,
});
function gap(g: HardDiskGas) {
  let worst = 0;
  for (let i = 0; i < g.particles.length; i++)
    for (let j = i + 1; j < g.particles.length; j++) {
      const a = g.particles[i],
        b = g.particles[j];
      worst = Math.max(worst, a.r + b.r - Math.hypot(b.x - a.x, b.y - a.y));
    }
  return worst;
}
function contained(g: HardDiskGas) {
  for (const p of g.particles) {
    expect(p.x).toBeGreaterThanOrEqual(p.r - POSITION_TOLERANCE);
    expect(p.x).toBeLessThanOrEqual(1 - p.r + POSITION_TOLERANCE);
    expect(p.y).toBeGreaterThanOrEqual(p.r - POSITION_TOLERANCE);
    expect(p.y).toBeLessThanOrEqual(1 - p.r + POSITION_TOLERANCE);
    if (g.divider) expect(Math.abs(p.x - 0.5)).toBeGreaterThanOrEqual(p.r - POSITION_TOLERANCE);
  }
}
describe('elastic impulses', () => {
  it('exchanges equal-mass head-on normal velocities once', () => {
    const a = disk(0.4, 0.5, 1),
      b = disk(0.44, 0.5, -1);
    expect(elasticCollision(a, b)).toBe(true);
    expect(a.vx).toBeCloseTo(-1, 12);
    expect(b.vx).toBeCloseTo(1, 12);
    expect(elasticCollision(a, b)).toBe(false);
  });
  it('conserves oblique vector momentum, tangential velocity and energy', () => {
    const a = disk(0.4, 0.4, 1),
      b = disk(0.4 + 0.04 / Math.SQRT2, 0.4 + 0.04 / Math.SQRT2);
    const before = mechanics([a, b]);
    expect(elasticCollision(a, b)).toBe(true);
    expect(a.vx).toBeCloseTo(0.5, 12);
    expect(a.vy).toBeCloseTo(-0.5, 12);
    expect(b.vx).toBeCloseTo(0.5, 12);
    expect(b.vy).toBeCloseTo(0.5, 12);
    const after = mechanics([a, b]);
    expect(after.px).toBeCloseTo(before.px, 12);
    expect(after.py).toBeCloseTo(before.py, 12);
    expect(after.energy).toBeCloseTo(before.energy, 12);
  });
  it('handles unequal masses with analytic 1D results', () => {
    const a = disk(0.4, 0.5, 1, 0, 0.02, 1),
      b = disk(0.44, 0.5, -1, 0, 0.02, 3),
      before = mechanics([a, b]);
    elasticCollision(a, b);
    expect(a.vx).toBeCloseTo(-2, 12);
    expect(b.vx).toBeCloseTo(0, 12);
    expect(mechanics([a, b]).px).toBeCloseTo(before.px, 12);
    expect(mechanics([a, b]).energy).toBeCloseTo(before.energy, 12);
  });
  it('ignores noncontact, grazing and zero relative motion', () => {
    expect(elasticCollision(disk(0.2, 0.5, 1), disk(0.8, 0.5, -1))).toBe(false);
    expect(contactTime(disk(0.2, 0.5, 1), disk(0.8, 0.6), 1)).toBe(Infinity);
    expect(contactTime(disk(0.2, 0.5, 1), disk(0.8, 0.5, 1), 1)).toBe(Infinity);
  });
  it('handles extremely small velocities without an absolute speed cutoff', () => {
    const a = disk(0.4, 0.5, 1e-12),
      b = disk(0.44, 0.5, -1e-12);
    expect(elasticCollision(a, b)).toBe(true);
    expect(a.vx).toBeLessThan(0);
    expect(b.vx).toBeGreaterThan(0);
    expect(mechanics([a, b]).energy).toBeCloseTo(1e-24, 30);
  });
});
describe('CCD and broad phase', () => {
  it('processes contact and the remainder of the step', () => {
    const g = new HardDiskGas([disk(0.3, 0.5, 1), disk(0.7, 0.5, -1)], false);
    g.step(0.25);
    expect(g.fault).toBeNull();
    expect(g.collisions).toBe(1);
    expect(g.particles[0].x).toBeCloseTo(0.41, 11);
    expect(g.particles[1].x).toBeCloseTo(0.59, 11);
  });
  it('finds fast collisions across initially distant cells', () => {
    const g = new HardDiskGas([disk(0.1, 0.5, 100, 0, 0.01), disk(0.9, 0.5, -100, 0, 0.01)], false);
    g.step(0.007);
    expect(g.fault).toBeNull();
    expect(g.collisions).toBe(1);
    expect(g.particles[0].x).toBeCloseTo(0.18, 10);
    expect(g.particles[1].x).toBeCloseTo(0.82, 10);
    expect(g.lastEvents).toBeGreaterThan(10);
    expect(gap(g)).toBeLessThanOrEqual(POSITION_TOLERANCE);
  });
  it('reflects at a finite-radius wall and tracks its external impulse', () => {
    const g = new HardDiskGas([disk(0.95, 0.5, 1)], false);
    g.step(0.1);
    expect(g.particles[0].x).toBeCloseTo(0.91, 12);
    expect(g.particles[0].vx).toBe(-1);
    expect(g.wallImpulseX).toBe(-2);
    expect(mechanics(g.particles).energy).toBeCloseTo(0.5, 12);
  });
  it('handles multiple fast bounces and simultaneous corner contact', () => {
    const g = new HardDiskGas([disk(0.2, 0.5, 100)], false);
    g.step(0.02);
    expect(g.fault).toBeNull();
    expect(g.particles[0].x).toBeCloseTo(0.28, 10);
    expect(g.particles[0].vx).toBe(100);
    const c = new HardDiskGas([disk(0.9, 0.9, 1, 1)], false);
    c.step(0.1);
    expect(c.particles[0].x).toBeCloseTo(0.96, 12);
    expect(c.particles[0].y).toBeCloseTo(0.96, 12);
    expect(c.particles[0].vx).toBe(-1);
    expect(c.particles[0].vy).toBe(-1);
  });
  it('reflects from either side of a closed divider at high speed', () => {
    const g = new HardDiskGas([disk(0.46, 0.25, 10), disk(0.54, 0.75, -10)], true);
    g.step(0.01);
    expect(g.fault).toBeNull();
    expect(g.particles[0].x).toBeCloseTo(0.4, 11);
    expect(g.particles[1].x).toBeCloseTo(0.6, 11);
    expect(g.collisions).toBe(0);
    contained(g);
  });
  it('allows passing through in collisions-off mode, while retaining walls', () => {
    const g = new HardDiskGas([disk(0.3, 0.5, 1), disk(0.7, 0.5, -1)], false, false);
    g.step(0.3);
    expect(g.collisions).toBe(0);
    expect(g.particles[0].x).toBeCloseTo(0.6, 12);
    expect(g.particles[1].x).toBeCloseTo(0.4, 12);
    expect(g.particles[0].vx).toBe(1);
  });
  it('conserves energy through a simultaneous three-body contact', () => {
    const g = new HardDiskGas([disk(0.3, 0.5, 1), disk(0.5, 0.5), disk(0.7, 0.5, -1)], false);
    g.step(0.25);
    expect(g.fault).toBeNull();
    expect(gap(g)).toBeLessThanOrEqual(POSITION_TOLERANCE);
    expect(mechanics(g.particles).energy).toBeCloseTo(1, 10);
    expect(mechanics(g.particles).momentum).toBeCloseTo(0, 10);
  });
  it('repairs coincident stationary input without NaN or energy creation', () => {
    const g = new HardDiskGas([disk(0.3, 0.5), disk(0.3, 0.5)]);
    g.step(FIXED_DT);
    expect(g.fault).toBeNull();
    expect(gap(g)).toBeLessThanOrEqual(POSITION_TOLERANCE);
    expect(mechanics(g.particles).energy).toBe(0);
    contained(g);
  });
  it('repairs coincident moving disks and responds without artificial acceleration', () => {
    const g = new HardDiskGas([disk(0.3, 0.5, 1), disk(0.3, 0.5, -1)]);
    g.step(FIXED_DT);
    expect(g.fault).toBeNull();
    expect(gap(g)).toBeLessThanOrEqual(POSITION_TOLERANCE);
    expect(mechanics(g.particles).energy).toBeCloseTo(1, 12);
    expect(g.collisions).toBe(1);
  });
  it('supports different radii in continuous contact detection', () => {
    const g = new HardDiskGas([disk(0.3, 0.5, 1, 0, 0.01), disk(0.7, 0.5, -1, 0, 0.03)], false);
    g.step(0.25);
    expect(g.fault).toBeNull();
    expect(g.collisions).toBe(1);
    expect(g.particles[0].x).toBeCloseTo(0.41, 11);
    expect(g.particles[1].x).toBeCloseTo(0.59, 11);
  });
  it('halts on the iteration limit instead of advancing through contacts', () => {
    const g = new HardDiskGas([disk(0.2, 0.5, 100)], false, true, 1);
    g.step(0.1);
    expect(g.fault).not.toBeNull();
    expect(g.time).toBeLessThan(0.1);
    contained(g);
    const time = g.time;
    g.step(0.1);
    expect(g.time).toBe(time);
  });
  it('rejects invalid disks and ignores invalid time', () => {
    expect(() => new HardDiskGas([disk(0.2, 0.5, 1, 0, 0)])).toThrow(RangeError);
    expect(() => new HardDiskGas([disk(0.2, 0.5, 1, 0, 0.01, 0)])).toThrow(RangeError);
    const g = new HardDiskGas([disk(0.2, 0.5)]);
    g.step(NaN);
    g.step(-1);
    expect(g.time).toBe(0);
  });
});
describe('initialization and long-time invariants', () => {
  it.each([100, 500, 1000, 2000])(
    'initializes %d disks without overlap strictly left of divider',
    (count) => {
      const g = createDiffusion(count, seededRandom(42), { radius: maximumRadius(count) });
      expect(gap(g)).toBeLessThanOrEqual(0);
      contained(g);
      expect(g.particles.every((p) => p.x + p.r <= 0.5)).toBe(true);
      const s = mechanics(g.particles);
      expect(s.momentum).toBeLessThan(1e-11);
      expect(s.energy).toBeCloseTo((count * 0.25 ** 2) / 2, 10);
      expect(new Set(g.particles.map((p) => Math.hypot(p.vx, p.vy))).size).toBeGreaterThan(
        count / 2,
      );
    },
  );
  it('preserves energy, number and momentum after wall impulse over 20 seconds', () => {
    const g = createDiffusion(100, seededRandom(123)),
      initial = mechanics(g.particles);
    g.setDivider(false);
    for (let i = 0; i < 1200; i++) {
      g.step(FIXED_DT);
      if (i % 60 === 0) expect(gap(g)).toBeLessThanOrEqual(POSITION_TOLERANCE);
    }
    const s = mechanics(g.particles);
    expect(g.fault).toBeNull();
    expect(g.particles).toHaveLength(100);
    expect(g.collisions).toBeGreaterThan(100);
    expect(Math.abs(s.energy / initial.energy - 1)).toBeLessThan(1e-10);
    expect(s.px - initial.px - g.wallImpulseX).toBeCloseTo(0, 9);
    expect(s.py - initial.py - g.wallImpulseY).toBeCloseTo(0, 9);
    contained(g);
  });
  it('avoids persistent overlap at high density and speed', () => {
    const g = createDiffusion(500, seededRandom(7), { radius: maximumRadius(500), velocity: 1 });
    for (let i = 0; i < 120; i++) {
      g.step(FIXED_DT);
      if (i % 10 === 0) {
        expect(g.fault).toBeNull();
        expect(gap(g)).toBeLessThanOrEqual(POSITION_TOLERANCE);
      }
    }
    expect(Math.abs(mechanics(g.particles).energy / g.initialEnergy - 1)).toBeLessThan(1e-10);
    contained(g);
  });
  it('safely opens and closes repeatedly without particle loss or trapped centers', () => {
    const g = createDiffusion(100, seededRandom(11), { radius: 0.012 });
    const energy = g.initialEnergy;
    for (let c = 0; c < 12; c++) {
      g.setDivider(false);
      for (let i = 0; i < 30; i++) g.step(FIXED_DT);
      expect(g.setDivider(true)).toBe(true);
      contained(g);
      expect(gap(g)).toBeLessThanOrEqual(POSITION_TOLERANCE);
      for (let i = 0; i < 10; i++) g.step(FIXED_DT);
    }
    expect(g.fault).toBeNull();
    expect(g.particles).toHaveLength(100);
    expect(Math.abs(mechanics(g.particles).energy / energy - 1)).toBeLessThan(1e-10);
  });
  it('handles a center exactly on the divider when closing', () => {
    const g = new HardDiskGas([disk(0.5, 0.5, -1), disk(0.56, 0.5)], false);
    expect(g.setDivider(true)).toBe(true);
    expect(g.particles[0].x).toBeGreaterThanOrEqual(0.52);
    expect(g.particles[0].vx).toBe(1);
    g.step(0.1);
    expect(g.fault).toBeNull();
    contained(g);
  });
  it('rolls back an unresolvable crowded divider insertion transaction', () => {
    const g = new HardDiskGas(
      [0.1, 0.3, 0.5, 0.7, 0.9].map((x) => disk(x, 0.5, 0, 0, 0.1)),
      false,
    );
    const before = structuredClone(g.particles);
    expect(g.setDivider(true)).toBe(false);
    expect(g.divider).toBe(false);
    expect(g.notice).not.toBeNull();
    expect(g.particles).toEqual(before);
    expect(g.time).toBe(0);
    expect(g.wallImpulseX).toBe(0);
  });
  it('reproduces identical seeded trajectories and statistics', () => {
    const a = createDiffusion(100, seededRandom(7)),
      b = createDiffusion(100, seededRandom(7));
    for (let i = 0; i < 60; i++) {
      if (i === 20) {
        a.setDivider(false);
        b.setDivider(false);
      }
      a.step(FIXED_DT);
      b.step(FIXED_DT);
    }
    expect(a.particles).toEqual(b.particles);
    expect(diffusionStats(a)).toEqual(diffusionStats(b));
  });
  it('zero-speed initialization remains exactly stationary', () => {
    const g = createDiffusion(100, seededRandom(8), { velocity: 0 }),
      before = structuredClone(g.particles);
    for (let i = 0; i < 60; i++) g.step(FIXED_DT);
    expect(g.particles).toEqual(before);
    expect(g.collisions).toBe(0);
    expect(g.time).toBeCloseTo(1, 12);
  });
  it('uses local candidates rather than all-pairs traversal', () => {
    const g = createDiffusion(2000, seededRandom(1), { radius: 0.002 });
    g.step(FIXED_DT);
    expect(g.fault).toBeNull();
    expect(g.lastCandidates).toBeLessThan(2000 * 100);
  });
  it('agrees across full and half timesteps, including grid-crossing contacts', () => {
    const a = createDiffusion(100, seededRandom(91)),
      b = createDiffusion(100, seededRandom(91));
    a.setDivider(false);
    b.setDivider(false);
    for (let i = 0; i < 60; i++) {
      a.step(FIXED_DT);
      b.step(FIXED_DT / 2);
      b.step(FIXED_DT / 2);
    }
    expect(a.collisions).toBe(b.collisions);
    expect(a.fault).toBeNull();
    expect(b.fault).toBeNull();
    for (let i = 0; i < a.particles.length; i++) {
      expect(a.particles[i].x).toBeCloseTo(b.particles[i].x, 8);
      expect(a.particles[i].y).toBeCloseTo(b.particles[i].y, 8);
      expect(a.particles[i].vx).toBeCloseTo(b.particles[i].vx, 8);
      expect(a.particles[i].vy).toBeCloseTo(b.particles[i].vy, 8);
    }
  });
});
