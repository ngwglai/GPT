import type {
  Candidate,
  Config,
  Execution,
  SearchResult,
  Termination,
} from "./types";
import {
  validateConfig,
  generate,
  mutate,
  validCandidate,
  canonical,
} from "./space";
import { Random } from "./random";
import { evaluate } from "./evaluate";
export function temperature(
  initial: number,
  final: number,
  index: number,
  budget: number,
): number {
  if (![initial, final].every(Number.isFinite) || final <= 0 || initial < final)
    throw new Error("温度边界无效");
  const fraction = Math.max(0, Math.min(1, index / Math.max(1, budget - 1)));
  return initial * Math.pow(final / initial, fraction);
}
export function accepts(delta: number, temp: number, draw: number): boolean {
  if (
    !Number.isFinite(temp) ||
    temp <= 0 ||
    !Number.isFinite(delta) ||
    draw < 0 ||
    draw >= 1 ||
    !Number.isFinite(draw)
  )
    throw new Error("接受规则参数无效");
  return delta >= 0 || draw < Math.exp(delta / temp);
}
export interface SearchDependencies {
  generate?: typeof generate;
  mutate?: typeof mutate;
  evaluate?: (c: Candidate, config: Config) => Execution;
}
export class Search {
  readonly result: SearchResult;
  readonly config: Config;
  private rng: Random;
  private current: Candidate | null = null;
  private currentCost = 0;
  private seen = new Set<string>();
  constructor(
    config: Config,
    private dependencies: SearchDependencies = {},
  ) {
    validateConfig(config);
    this.config = structuredClone(config);
    Object.freeze(this.config.space);
    Object.freeze(this.config);
    this.rng = new Random(this.config.seed);
    this.result = {
      config: structuredClone(config),
      generated: 0,
      rejected: 0,
      duplicates: 0,
      evaluations: 0,
      failures: 0,
      best: null,
      bestCost: null,
      execution: null,
      history: [],
      termination: null,
    };
  }
  stop(reason: Termination): void {
    if (this.result.termination) return;
    this.result.termination = reason;
    if (
      this.result.bestCost !== null &&
      this.result.history.at(-1)?.evaluation !== this.result.evaluations
    )
      this.result.history.push({
        evaluation: this.result.evaluations,
        cost: this.result.bestCost,
      });
  }
  step(): void {
    const r = this.result,
      c = this.config;
    if (r.termination) return;
    if (r.evaluations >= c.budget) {
      this.stop("budget");
      return;
    }
    if (r.generated >= c.budget * 10) {
      this.stop("proposal-limit");
      return;
    }
    r.generated++;
    try {
      const candidate =
        this.current === null || c.strategy === "random"
          ? (this.dependencies.generate ?? generate)(c.space, this.rng)
          : (this.dependencies.mutate ?? mutate)(
              this.current,
              c.space,
              this.rng,
            );
      if (!validCandidate(candidate, c.space)) {
        r.rejected++;
        return;
      }
      const key = canonical(candidate);
      if (this.seen.has(key)) r.duplicates++;
      else this.seen.add(key);
      // Every legal candidate, including duplicates, is executed and spends one evaluation.
      r.evaluations++;
      const execution = (this.dependencies.evaluate ?? evaluate)(candidate, c),
        cost = execution.metrics[c.metric];
      if (!Number.isSafeInteger(cost) || cost < 0)
        throw new Error("评价返回非法成本");
      const improved = r.bestCost === null || cost > r.bestCost;
      if (improved) {
        r.best = structuredClone(candidate);
        r.bestCost = cost;
        r.execution = execution;
      }
      if (
        this.current === null ||
        c.strategy === "random" ||
        (c.strategy === "hill" && cost >= this.currentCost) ||
        (c.strategy === "annealing" &&
          accepts(
            cost - this.currentCost,
            temperature(
              c.initialTemperature,
              c.finalTemperature,
              r.evaluations - 1,
              c.budget,
            ),
            this.rng.next(),
          ))
      ) {
        this.current = candidate;
        this.currentCost = cost;
      }
      if (improved || r.evaluations % Math.ceil(c.budget / 500) === 0)
        r.history.push({ evaluation: r.evaluations, cost: r.bestCost! });
      if (r.evaluations === c.budget) this.stop("budget");
    } catch {
      r.failures++;
      r.error = "候选生成或算法评价异常；未将异常记为成功结果";
      this.stop("error");
    }
  }
}
