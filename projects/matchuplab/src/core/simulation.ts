import { createAgent, type AgentState } from './agents';
import { validateConfig } from './config';
import { GAMES, normalizeReward, payoff } from './games';
import { opponentAction } from './opponents';
import { sample, stream, type Random } from './random';
import { Accumulator, summarize } from './statistics';
import type { Algorithm, Config, CurvePoint, Experiment, Phase, Round, RunResult } from './types';

export class Simulation {
  private readonly agent;
  private readonly game;
  private readonly stages: Phase[];
  private stage = 0;
  private round = 0;
  private previous: number | undefined;
  private learnerRandom: Random;
  private rivalRandom: Random;
  private accumulator: Accumulator;
  private curve: CurvePoint[] = [];
  private frozenPolicy: number[] = [];
  readonly result: RunResult;
  constructor(readonly config: Config, readonly algorithm: Algorithm, readonly seed: number) {
    validateConfig(config, [algorithm], 1);
    this.game = GAMES[config.game];
    this.agent = createAgent(algorithm, this.game.actions.length, config.epsilon, config.gamma);
    this.stages = config.transfer ? ['train', 'test', 'transfer'] : ['train', 'test'];
    this.learnerRandom = stream(seed, 1);
    this.rivalRandom = stream(seed, 2);
    this.accumulator = new Accumulator(this.game.actions.length);
    this.result = { algorithm, seed, phases: {}, policy: [] };
  }
  get done() { return this.stage === this.stages.length; }
  get phase(): Phase { return this.stages[Math.min(this.stage, this.stages.length - 1)]; }
  agentState(): AgentState { return this.agent.state(); }
  step(): Round | undefined {
    if (this.done) return undefined;
    const phase = this.phase;
    const action = phase === 'train' ? this.agent.act(this.learnerRandom) : sample(this.frozenPolicy, this.learnerRandom);
    const spec = phase === 'transfer' ? this.config.target : this.config.opponent;
    const rival = opponentAction(spec, this.game, this.round, this.previous, this.rivalRandom);
    const reward = payoff(this.game, action, rival);
    if (phase === 'train') this.agent.update(action, normalizeReward(this.game, reward));
    this.accumulator.add(reward, action);
    this.previous = action;
    this.round++;
    const event = { phase, round: this.round, action, opponentAction: rival, reward };
    const limit = phase === 'train' ? this.config.trainRounds : this.config.testRounds;
    const stride = Math.max(1, Math.ceil(limit / 250));
    if (this.round === 1 || this.round % stride === 0 || this.round === limit) this.curve.push({ round: this.round, mean: this.accumulator.value.mean, total: this.accumulator.value.total });
    this.result.phases[phase] = { metrics: this.accumulator.snapshot(), curve: this.curve };
    if (this.round === limit) {
      if (phase === 'train') { this.frozenPolicy = this.agent.policy(); this.result.policy = [...this.frozenPolicy]; }
      this.stage++;
      this.round = 0;
      this.previous = undefined;
      this.accumulator = new Accumulator(this.game.actions.length);
      this.curve = [];
      // Source test and transfer use matched fresh random streams; train streams are disjoint.
      this.learnerRandom = stream(this.seed, 3);
      this.rivalRandom = stream(this.seed, 4);
    }
    return event;
  }
}

export function makeExperiment(config: Config, algorithms: Algorithm[], runs: RunResult[], seeds: number): Experiment {
  return { schemaVersion: 1, config: structuredClone(config), algorithms: [...algorithms],
    seedValues: Array.from({ length: seeds }, (_, i) => (config.seed + i) >>> 0), runs, summary: summarize(runs) };
}

// A single incremental interface for demo, batch, Worker, and tests.
export class ExperimentTask {
  private readonly totalRuns: number;
  private current: Simulation | undefined;
  private completed: RunResult[] = [];
  private cancelled = false;
  steps = 0;
  readonly budget: number;
  constructor(readonly config: Config, readonly algorithms: Algorithm[], readonly seeds: number) {
    this.budget = validateConfig(config, algorithms, seeds);
    this.totalRuns = algorithms.length * seeds;
  }
  get done() { return this.completed.length === this.totalRuns; }
  cancel() { this.cancelled = true; }
  tick(maxSteps = 256): Round[] {
    if (this.cancelled) throw new Error('实验已取消');
    if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 1024) throw new Error('每批步数须为 1–1024');
    const events: Round[] = [];
    for (let i = 0; i < maxSteps && !this.done; i++) {
      if (!this.current) {
        const index = this.completed.length;
        this.current = new Simulation(this.config, this.algorithms[index % this.algorithms.length], (this.config.seed + Math.floor(index / this.algorithms.length)) >>> 0);
      }
      const event = this.current.step();
      if (event) { events.push(event); this.steps++; }
      if (this.current.done) { this.completed.push(structuredClone(this.current.result)); this.current = undefined; }
    }
    return events;
  }
  snapshot(): RunResult | undefined { return this.current ? structuredClone(this.current.result) : this.completed.at(-1); }
  finish(): Experiment {
    if (this.cancelled || !this.done) throw new Error('实验尚未完整完成，不能导出');
    return makeExperiment(this.config, this.algorithms, this.completed, this.seeds);
  }
}
