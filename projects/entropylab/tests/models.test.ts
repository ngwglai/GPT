import { describe, expect, it } from 'vitest';
import { bounded, seededRandom, shannonEntropy } from '../src/utils/numbers';
import {
  createDiffusion,
  diffusionStats,
  stepDiffusion,
  HardDiskGas,
} from '../src/experiments/diffusion/model';
import { createWalk, stepWalk, TRAIL_LIMIT, walkStats } from '../src/experiments/random-walk/model';
import {
  createLife,
  liveCount,
  paintCell,
  stepLife,
  type Boundary,
} from '../src/experiments/game-of-life/model';
import { createIsing, deltaEnergy, isingStats, stepIsing } from '../src/experiments/ising/model';
import { canvasCell } from '../src/experiments/render';
import { defaults, HISTORY_LIMIT, sanitizeConfig, Session } from '../src/experiments/session';
import { SimulationClock } from '../src/utils/clock';

describe('Shannon entropy', () => {
  it.each([
    [[], 0],
    [[0, 0], 0],
    [[10, 0], 0],
    [[1, 1], 1],
    [[1, 1, 1, 1], 2],
    [[1, 3], 0.8112781244591328],
  ])('counts %j → %d bits', (counts, entropy) => {
    expect(shannonEntropy(counts)).toBeCloseTo(entropy, 12);
  });
  it('has log₂100 bits for a uniform 10×10 grid, independent of count scale', () => {
    expect(shannonEntropy(new Array(100).fill(5))).toBeCloseTo(Math.log2(100), 12);
  });
  it.each([[-1, 2], [Infinity], [NaN], [Number.MAX_VALUE, Number.MAX_VALUE]])(
    'rejects invalid counts %j',
    (...counts) => {
      expect(() => shannonEntropy(counts)).toThrow(RangeError);
    },
  );
});

describe('diffusion', () => {
  it('initializes all particles in the left half and counts every grid/bin entry', () => {
    const model = createDiffusion(1000, seededRandom(1));
    const s = diffusionStats(model);
    expect(s.left).toBe(1000);
    expect(s.right).toBe(0);
    expect(s.histogram.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(s.entropy).toBeGreaterThan(5);
    expect(s.entropy).toBeLessThanOrEqual(Math.log2(50));
  });
  it('reflects at walls and divider without changing velocity magnitude', () => {
    const state = new HardDiskGas([{ x: 0.49, y: 0.99, vx: 1, vy: 1, r: 0.005, m: 1 }]);
    stepDiffusion(state, 0.1, true);
    expect(state.particles[0].x).toBeCloseTo(0.4);
    expect(state.particles[0].y).toBeCloseTo(0.9);
    expect(state.particles[0].vx).toBe(-1);
    expect(state.particles[0].vy).toBe(-1);
  });
  it('opening crosses the middle; closing retains particles on both sides', () => {
    const state = new HardDiskGas([{ x: 0.49, y: 0.5, vx: 1, vy: 0, r: 0.005, m: 1 }], false);
    stepDiffusion(state, 0.1, false);
    expect(state.particles[0].x).toBeCloseTo(0.59);
    state.particles[0].vx = -1;
    stepDiffusion(state, 0.2, true);
    expect(state.particles[0].x).toBeCloseTo(0.62);
  });
  it('preserves containment and energy over long runs at maximum count', () => {
    const state = createDiffusion(2000, seededRandom(7));
    for (let i = 0; i < 180; i++) stepDiffusion(state, 1 / 60, i < 90);
    expect(state.particles.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)).toBe(true);
    expect(state.fault).toBeNull();
    expect(diffusionStats(state).energy).toBeCloseTo(state.initialEnergy, 10);
  });
  it('zero velocity freezes positions while time advances; invalid dt is ignored', () => {
    const state = createDiffusion(10, seededRandom(1), { velocity: 0 });
    const before = structuredClone(state.particles);
    stepDiffusion(state, 1, false);
    expect(state.particles).toEqual(before);
    expect(state.time).toBe(1);
    stepDiffusion(state, NaN, false);
    expect(state.time).toBe(1);
  });
});

describe('random walk', () => {
  it('takes a fixed-length step and computes MSD from origin, not trail length', () => {
    const state = createWalk(1, 2);
    stepWalk(state, () => 0);
    expect(state.particles[0].x).toBe(2);
    expect(walkStats(state)).toEqual({ msd: 4, theoretical: 4 });
    stepWalk(state, () => 0.5);
    expect(walkStats(state).msd).toBeCloseTo(0, 10);
    expect(walkStats(state).theoretical).toBe(8);
  });
  it('matches the theoretical ensemble MSD within statistical tolerance', () => {
    const state = createWalk(512, 1.5);
    const rng = seededRandom(23);
    for (let i = 0; i < 500; i++) stepWalk(state, rng);
    const { msd, theoretical } = walkStats(state);
    expect(msd / theoretical).toBeGreaterThan(0.85);
    expect(msd / theoretical).toBeLessThan(1.15);
    expect(Math.abs(state.particles.reduce((sum, p) => sum + p.x, 0) / 512)).toBeLessThan(4);
  });
  it('bounds every trajectory and keeps full displacement after old points expire', () => {
    const state = createWalk(3, 1);
    for (let i = 0; i < 1000; i++) stepWalk(state, () => 0);
    expect(state.particles.every((p) => p.trail.length === TRAIL_LIMIT)).toBe(true);
    expect(walkStats(state).msd).toBe(1_000_000);
  });
});

describe('Conway Life', () => {
  function empty() {
    return createLife(40, 'empty', seededRandom(1));
  }
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8])('applies birth/survival for %d neighbors', (neighbors) => {
    const offsets = [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ];
    for (const initial of [false, true]) {
      const state = empty();
      paintCell(state, 10, 10, initial);
      offsets.slice(0, neighbors).forEach(([x, y]) => paintCell(state, 10 + x, 10 + y, true));
      stepLife(state, 'finite');
      expect(state.cells[10 * state.size + 10]).toBe(
        neighbors === 3 || (initial && neighbors === 2) ? 1 : 0,
      );
    }
  });
  it('keeps a block stable and blinker oscillating with synchronous updates', () => {
    const block = empty();
    [
      [5, 5],
      [5, 6],
      [6, 5],
      [6, 6],
    ].forEach(([x, y]) => paintCell(block, x, y, true));
    const original = block.cells.slice();
    for (let i = 0; i < 10; i++) stepLife(block, 'finite');
    expect(block.cells).toEqual(original);
    const blinker = createLife(40, 'blinker', seededRandom(1));
    const before = blinker.cells.slice();
    stepLife(blinker, 'periodic');
    expect(blinker.cells).not.toEqual(before);
    expect(liveCount(blinker)).toBe(3);
    stepLife(blinker, 'periodic');
    expect(blinker.cells).toEqual(before);
    expect(blinker.generation).toBe(2);
  });
  it('moves a glider one diagonal cell in four generations', () => {
    const state = createLife(40, 'glider', seededRandom(1));
    const before = state.cells.slice();
    for (let i = 0; i < 4; i++) stepLife(state, 'finite');
    for (let y = 1; y < 40; y++)
      for (let x = 1; x < 40; x++)
        expect(state.cells[y * 40 + x]).toBe(before[(y - 1) * 40 + x - 1]);
  });
  it.each(['finite', 'periodic'] as Boundary[])(
    'handles %s boundaries independently',
    (boundary) => {
      const state = empty();
      [39, 0, 1].forEach((x) => paintCell(state, x, 0, true));
      stepLife(state, boundary);
      expect(state.cells[39 * 40]).toBe(boundary === 'periodic' ? 1 : 0);
      expect(state.cells[40]).toBe(boundary === 'periodic' ? 1 : 0);
    },
  );
  it('ignores drawing outside the grid and supports erase', () => {
    const state = empty();
    [
      [-1, 0],
      [40, 1],
      [2, 40],
      [NaN, 1],
      [1.5, 2],
    ].forEach(([x, y]) => paintCell(state, x, y, true));
    expect(liveCount(state)).toBe(0);
    paintCell(state, 1, 1, true);
    expect(liveCount(state)).toBe(1);
    paintCell(state, 1, 1, false);
    expect(liveCount(state)).toBe(0);
  });
  it('has a period-three pulsar preset', () => {
    const state = createLife(40, 'pulsar', seededRandom(1));
    const before = state.cells.slice();
    expect(liveCount(state)).toBe(48);
    for (let i = 0; i < 3; i++) stepLife(state, 'finite');
    expect(state.cells).toEqual(before);
  });
});

describe('Ising model', () => {
  it('counts each bond once: ordered state has energy −2J per spin and m=1', () => {
    const state = createIsing(16, true, seededRandom(1));
    expect(isingStats(state)).toEqual({ magnetization: 1, energy: -2 });
    expect(deltaEnergy(state, 0, 0)).toBe(8);
    expect(deltaEnergy(state, 15, 15)).toBe(8);
  });
  it('agrees with independent total-energy differences for every site including boundaries', () => {
    const state = createIsing(16, false, seededRandom(123));
    function independentEnergy() {
      const { size: n, spins } = state;
      let energy = 0;
      for (let i = 0; i < spins.length; i++)
        for (const j of [Math.floor(i / n) * n + ((i + 1) % n), (i + n) % spins.length])
          energy -= spins[i] * spins[j];
      return energy;
    }
    for (let y = 0; y < state.size; y++)
      for (let x = 0; x < state.size; x++) {
        const before = independentEnergy();
        const delta = deltaEnergy(state, x, y);
        state.spins[y * state.size + x] *= -1;
        expect(independentEnergy() - before).toBeCloseTo(delta, 12);
        state.spins[y * state.size + x] *= -1;
      }
  });
  it('rejects positive energy at T=0 and accepts energy-lowering flips', () => {
    const state = createIsing(16, true, seededRandom(1));
    stepIsing(state, 0, () => 0);
    expect(isingStats(state).energy).toBe(-2);
    expect(state.acceptance).toBe(0);
    state.spins[0] = -1;
    stepIsing(state, 0, () => 0);
    expect(state.spins[0]).toBe(1);
    expect(state.acceptance).toBe(1 / 256);
  });
  it('uses Boltzmann acceptance for uphill moves', () => {
    const rejected = createIsing(16, true, seededRandom(1));
    stepIsing(rejected, 1, () => 0.01);
    expect(rejected.acceptance).toBe(0);
    const accepted = createIsing(16, true, seededRandom(1));
    stepIsing(accepted, 5, () => 0);
    expect(accepted.acceptance).toBe(1);
  });
  it('orders at low T and disorders at high T after relaxation', () => {
    const low = createIsing(16, true, seededRandom(4)),
      high = createIsing(16, true, seededRandom(4));
    const rngLow = seededRandom(5),
      rngHigh = seededRandom(5);
    for (let i = 0; i < 300; i++) {
      stepIsing(low, 0.5, rngLow);
      stepIsing(high, 5, rngHigh);
    }
    expect(Math.abs(isingStats(low).magnetization)).toBeGreaterThan(0.95);
    expect(Math.abs(isingStats(high).magnetization)).toBeLessThan(0.6);
    expect(isingStats(high).energy).toBeGreaterThan(-1.3);
  });
});

describe('fixed-tick simulation controls', () => {
  it('pauses, resumes without catch-up, steps only while paused, and resets', () => {
    const clock = new SimulationClock();
    let ticks = 0;
    const tick = () => ticks++;
    clock.frame(0, 10, tick);
    clock.frame(100, 10, tick);
    expect(ticks).toBe(0);
    clock.singleStep(tick);
    expect(ticks).toBe(1);
    clock.play();
    clock.frame(100, 10, tick);
    clock.frame(200, 10, tick);
    expect(ticks).toBe(2);
    clock.singleStep(tick);
    expect(ticks).toBe(2);
    clock.pause();
    clock.frame(5000, 10, tick);
    expect(ticks).toBe(2);
    clock.play();
    clock.frame(6000, 10, tick);
    clock.frame(6100, 10, tick);
    expect(ticks).toBe(3);
    clock.reset();
    expect(clock.running).toBe(false);
    clock.frame(6200, 10, tick);
    expect(ticks).toBe(3);
  });
  it('is independent of frame cadence, respects speed and limits long-frame backlog', () => {
    const count = (frameMs: number, rate: number) => {
      const c = new SimulationClock();
      let n = 0;
      c.play();
      for (let t = 0; t <= 1000; t += frameMs) c.frame(t, rate, () => n++);
      return n;
    };
    expect(count(10, 60)).toBe(60);
    expect(count(20, 60)).toBe(60);
    expect(count(10, 120)).toBe(120);
    const c = new SimulationClock();
    c.play();
    c.frame(0, 240, () => {});
    expect(c.frame(100_000, 240, () => {})).toBe(24);
    c.resync();
    expect(c.frame(200_000, 240, () => {})).toBe(0);
  });
  it.each([NaN, Infinity, -1, 0])('ignores invalid rate %s', (rate) => {
    const clock = new SimulationClock();
    clock.play();
    expect(
      clock.frame(100, rate, () => {
        throw new Error('tick');
      }),
    ).toBe(0);
  });
});

describe('session and input bounds', () => {
  it('keeps the random generator reproducible with 32-bit wrapping over long runs', () => {
    const rng = seededRandom(42);
    let actual = 0;
    for (let i = 0; i < 5_000_010; i++) {
      actual = rng();
    }
    // Golden value at this index, with state derived independently using BigInt.
    expect(actual).toBe(0.0511387197766453);
    expect(actual).toBeGreaterThanOrEqual(0);
    expect(actual).toBeLessThan(1);
  });
  it.each(['diffusion', 'walk', 'life', 'ising'] as const)(
    'resets %s with identical initial state and bounded history',
    (id) => {
      const state = new Session(id);
      const initial = state.snapshot();
      state.tick();
      const reset = new Session(id);
      expect(reset.snapshot()).toEqual(initial);
      for (let i = 0; i < 400; i++) state.tick();
      expect(state.history.length).toBeLessThanOrEqual(HISTORY_LIMIT);
      expect(state.snapshot().x).toBeGreaterThan(0);
    },
  );
  it('distinguishes live and structural parameters', () => {
    const diffusion = new Session('diffusion');
    expect(diffusion.updateConfig({ divider: false, gasDisplay: 'speed' })).toBe(false);
    expect(diffusion.updateConfig({ velocity: 1 })).toBe(true);
    expect(diffusion.updateConfig({ interactions: false })).toBe(true);
    expect(diffusion.updateConfig({ count: 1000 })).toBe(true);
    const walk = new Session('walk');
    expect(walk.updateConfig({ stepLength: 3 })).toBe(true);
    const life = new Session('life');
    expect(life.updateConfig({ boundary: 'finite' })).toBe(false);
    expect(life.updateConfig({ preset: 'empty' })).toBe(true);
    const ising = new Session('ising');
    expect(ising.updateConfig({ temperature: 0 })).toBe(false);
    expect(ising.updateConfig({ ordered: true })).toBe(true);
  });
  it('clamps extremes and replaces non-finite input with defaults', () => {
    const c = sanitizeConfig('diffusion', {
      ...defaults.diffusion,
      count: 1e9,
      velocity: -1,
      speed: Infinity,
      size: NaN,
      temperature: -100,
    });
    expect(c.count).toBe(2000);
    expect(c.velocity).toBe(0);
    expect(c.speed).toBe(1);
    expect(c.size).toBe(64);
    expect(c.temperature).toBe(0);
    expect(sanitizeConfig('walk', { ...defaults.walk, count: -10, stepLength: NaN }).count).toBe(1);
    expect(createDiffusion(NaN, seededRandom(1)).particles.length).toBe(500);
    expect(createIsing(NaN, false, seededRandom(1)).size).toBe(64);
    expect(createLife(-10, 'empty', seededRandom(1)).size).toBe(40);
    expect(bounded(5.5, 1, 10, 2, true)).toBe(6);
  });
  it('maps responsive rectangular canvas coordinates into square lattice cells', () => {
    expect(canvasCell(600, 400, 300, 200, 64)).toEqual([32, 32]);
    expect(canvasCell(400, 600, 18, 118, 40)).toEqual([0, 0]);
    expect(canvasCell(400, 600, 0, 0, 40)[0]).toBeLessThan(0);
  });
});
