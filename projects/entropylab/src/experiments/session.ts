import { bounded, seededRandom, type Random } from '../utils/numbers';
import { createDiffusion, diffusionStats, stepDiffusion, type Diffusion } from './diffusion/model';
import { createWalk, stepWalk, walkStats, type Walk } from './random-walk/model';
import {
  createLife,
  liveCount,
  stepLife,
  type Boundary,
  type Life,
  type Preset,
} from './game-of-life/model';
import { createIsing, isingStats, stepIsing, type Ising } from './ising/model';

export type ExperimentId = 'diffusion' | 'walk' | 'life' | 'ising';
export interface Config {
  count: number;
  velocity: number;
  divider: boolean;
  stepLength: number;
  size: number;
  boundary: Boundary;
  preset: Preset;
  temperature: number;
  ordered: boolean;
  rate: number;
  speed: number;
  trailLength: number;
}
export const defaults: Record<ExperimentId, Config> = {
  diffusion: {
    count: 600,
    velocity: 0.25,
    divider: true,
    stepLength: 1,
    size: 64,
    boundary: 'periodic',
    preset: 'glider',
    temperature: 2.27,
    ordered: false,
    rate: 10,
    speed: 1,
    trailLength: 64,
  },
  walk: {
    count: 200,
    velocity: 0.25,
    divider: false,
    stepLength: 1,
    size: 64,
    boundary: 'periodic',
    preset: 'glider',
    temperature: 2.27,
    ordered: false,
    rate: 10,
    speed: 1,
    trailLength: 64,
  },
  life: {
    count: 200,
    velocity: 0.25,
    divider: false,
    stepLength: 1,
    size: 64,
    boundary: 'periodic',
    preset: 'glider',
    temperature: 2.27,
    ordered: false,
    rate: 10,
    speed: 1,
    trailLength: 64,
  },
  ising: {
    count: 200,
    velocity: 0.25,
    divider: false,
    stepLength: 1,
    size: 64,
    boundary: 'periodic',
    preset: 'glider',
    temperature: 2.27,
    ordered: false,
    rate: 10,
    speed: 1,
    trailLength: 64,
  },
};
const presets: Preset[] = ['glider', 'blinker', 'pulsar', 'gosper', 'random', 'empty'];

export function sanitizeConfig(id: ExperimentId, config: Config): Config {
  const d = defaults[id];
  return {
    count: bounded(
      config.count,
      id === 'diffusion' ? 10 : 1,
      id === 'diffusion' ? 2000 : 512,
      d.count,
      true,
    ),
    velocity: bounded(config.velocity, 0, 1, d.velocity),
    divider: typeof config.divider === 'boolean' ? config.divider : d.divider,
    stepLength: bounded(config.stepLength, 0.5, 5, d.stepLength),
    size: bounded(config.size, id === 'life' ? 40 : 16, 96, d.size, true),
    boundary: config.boundary === 'finite' ? 'finite' : 'periodic',
    preset: presets.includes(config.preset) ? config.preset : d.preset,
    temperature: bounded(config.temperature, 0, 5, d.temperature),
    ordered: typeof config.ordered === 'boolean' ? config.ordered : d.ordered,
    rate: bounded(config.rate, 1, 30, d.rate, true),
    speed: bounded(config.speed, 0.25, 4, d.speed),
    trailLength: bounded(config.trailLength, 16, 128, d.trailLength, true),
  };
}

export interface Sample {
  x: number;
  a: number;
  b: number;
}
export interface Snapshot {
  x: number;
  a: number;
  b: number;
  c: number;
  bars: number[];
  history: Sample[];
}
export const HISTORY_LIMIT = 360;

/** Owns numerical state; independent of React, Canvas and wall-clock time. */
export class Session {
  readonly id: ExperimentId;
  config: Config;
  diffusion?: Diffusion;
  walk?: Walk;
  life?: Life;
  ising?: Ising;
  history: Sample[] = [];
  private rng: Random;
  private ticks = 0;

  constructor(id: ExperimentId, config = defaults[id], seed = 42) {
    this.id = id;
    this.config = sanitizeConfig(id, config);
    this.rng = seededRandom(seed);
    const c = this.config;
    if (id === 'diffusion') this.diffusion = createDiffusion(c.count, this.rng);
    if (id === 'walk') this.walk = createWalk(c.count, c.stepLength);
    if (id === 'life') this.life = createLife(c.size, c.preset, this.rng);
    if (id === 'ising') this.ising = createIsing(c.size, c.ordered, this.rng);
    this.record();
  }

  updateConfig(patch: Partial<Config>): boolean {
    const next = sanitizeConfig(this.id, { ...this.config, ...patch });
    const structural: (keyof Config)[] =
      this.id === 'diffusion'
        ? ['count']
        : this.id === 'walk'
          ? ['count', 'stepLength']
          : this.id === 'life'
            ? ['size', 'preset']
            : ['size', 'ordered'];
    const restart = structural.some((k) => next[k] !== this.config[k]);
    this.config = next;
    return restart;
  }

  tick(): void {
    const c = this.config;
    if (this.diffusion) stepDiffusion(this.diffusion, 1 / 60, c.velocity, c.divider);
    if (this.walk) stepWalk(this.walk, this.rng);
    if (this.life) stepLife(this.life, c.boundary);
    if (this.ising) stepIsing(this.ising, c.temperature, this.rng);
    this.ticks++;
    if (this.id !== 'diffusion' || this.ticks % 6 === 0) this.record();
  }

  snapshot(): Snapshot {
    if (this.diffusion) {
      const stats = diffusionStats(this.diffusion);
      return {
        x: this.diffusion.time,
        a: stats.entropy,
        b: stats.left,
        c: stats.right,
        bars: stats.histogram,
        history: this.history.slice(),
      };
    }
    if (this.walk) {
      const stats = walkStats(this.walk);
      const maxRadius = Math.max(
        1,
        Math.sqrt(stats.theoretical) * 3,
        ...this.walk.particles.map((p) => Math.hypot(p.x, p.y)),
      );
      const bars = new Array<number>(10).fill(0);
      for (const p of this.walk.particles)
        bars[Math.min(9, Math.floor((Math.hypot(p.x, p.y) / maxRadius) * 10))]++;
      return {
        x: this.walk.steps,
        a: stats.msd,
        b: stats.theoretical,
        c: maxRadius,
        bars,
        history: this.history.slice(),
      };
    }
    if (this.life) {
      const bars = new Array<number>(8).fill(0);
      this.life.cells.forEach((v, i) => {
        bars[Math.min(7, Math.floor(((i % this.life!.size) / this.life!.size) * 8))] += v;
      });
      const count = liveCount(this.life);
      return {
        x: this.life.generation,
        a: count,
        b: count / this.life.cells.length,
        c: this.life.size,
        bars,
        history: this.history.slice(),
      };
    }
    const stats = isingStats(this.ising!);
    return {
      x: this.ising!.sweeps,
      a: stats.magnetization,
      b: stats.energy,
      c: this.ising!.acceptance,
      bars: [],
      history: this.history.slice(),
    };
  }

  record(): void {
    const { x, a, b } = this.snapshot();
    const previous = this.history[this.history.length - 1];
    if (previous?.x === x) this.history[this.history.length - 1] = { x, a, b };
    else this.history.push({ x, a, b });
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }
}
