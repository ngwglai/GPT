import { Search } from "../core/search";
import { Exact } from "../core/exact";
import { validateBatch } from "../core/space";
import { strategies } from "../core/types";
import type {
  BatchConfig,
  Config,
  Snapshot,
  SortAlgorithm,
  Termination,
} from "../core/types";
import type { Command, Reply } from "./protocol";
export interface Scheduler {
  now(): number;
  schedule(fn: () => void): unknown;
  clear(handle: unknown): void;
}
export const browserScheduler: Scheduler = {
  now: () => performance.now(),
  schedule: (fn) => setTimeout(fn, 0),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
export class Runner {
  private id = "";
  private config: BatchConfig | null = null;
  private queue: Config[] = [];
  private search: Search | null = null;
  private exact: Exact | null = null;
  private timer: unknown;
  private elapsed = 0;
  private resumedAt = 0;
  snapshot: Snapshot = {
    status: "idle",
    results: [],
    current: null,
    exact: null,
  };
  constructor(
    private emit: (reply: Reply) => void,
    private scheduler: Scheduler = browserScheduler,
  ) {}
  private publish(): void {
    this.snapshot.current = this.search?.result ?? null;
    this.snapshot.exact = this.exact?.result ?? null;
    this.emit({ id: this.id, snapshot: structuredClone(this.snapshot) });
  }
  command(message: Command): void {
    if (message.type === "start") {
      if (
        this.snapshot.status === "running" ||
        this.snapshot.status === "paused"
      )
        return;
      this.scheduler.clear(this.timer);
      this.id = message.id;
      this.elapsed = 0;
      this.resumedAt = this.scheduler.now();
      this.config = structuredClone(message.config);
      this.search = null;
      this.exact = null;
      this.queue = [];
      this.snapshot = {
        status: "running",
        results: [],
        current: null,
        exact: null,
      };
      try {
        validateBatch(this.config);
        for (const strategy of this.config.compare
          ? strategies
          : [this.config.experiment.strategy])
          for (const seed of this.config.seeds)
            this.queue.push({ ...this.config.experiment, strategy, seed });
        this.search = new Search(this.queue.shift()!);
      } catch {
        this.snapshot.status = "error";
        this.snapshot.error = "实验配置无效；未启动计算";
        this.publish();
        return;
      }
      this.publish();
      this.schedule();
      return;
    }
    if (message.id !== this.id) return;
    if (message.type === "pause" && this.snapshot.status === "running") {
      this.elapsed += this.scheduler.now() - this.resumedAt;
      this.scheduler.clear(this.timer);
      this.snapshot.status = "paused";
      this.publish();
    } else if (message.type === "resume" && this.snapshot.status === "paused") {
      this.resumedAt = this.scheduler.now();
      this.snapshot.status = "running";
      this.publish();
      this.schedule();
    } else if (
      message.type === "cancel" &&
      (this.snapshot.status === "running" || this.snapshot.status === "paused")
    )
      this.finish("cancelled");
  }
  private schedule(): void {
    this.timer = this.scheduler.schedule(() => this.tick());
  }
  private finish(reason: Termination): void {
    this.scheduler.clear(this.timer);
    if (this.search && !this.search.result.termination)
      this.search.stop(reason);
    if (this.search) {
      this.snapshot.results.push(this.search.result);
      this.search = null;
    }
    if (reason === "timeout" || reason === "cancelled" || reason === "error")
      this.exact?.stop(reason);
    this.snapshot.status = reason;
    this.publish();
  }
  private tick(): void {
    if (this.snapshot.status !== "running" || !this.config) return;
    if (
      this.elapsed + this.scheduler.now() - this.resumedAt >=
      this.config.timeoutMs
    ) {
      this.finish("timeout");
      return;
    }
    try {
      if (this.search) {
        for (let i = 0; i < 32 && !this.search.result.termination; i++)
          this.search.step();
        if (this.search.result.termination) {
          const reason = this.search.result.termination;
          if (reason !== "budget") {
            this.finish(reason);
            return;
          }
          this.snapshot.results.push(this.search.result);
          this.search = null;
          if (this.queue.length) this.search = new Search(this.queue.shift()!);
          else if (
            this.config.exact &&
            this.config.experiment.space.kind === "sort"
          )
            this.exact = new Exact(
              this.config.experiment.space.size,
              this.config.experiment.algorithm as SortAlgorithm,
              this.config.experiment.metric,
            );
        }
      } else if (this.exact?.result.reason === "running") {
        for (let i = 0; i < 64 && this.exact.result.reason === "running"; i++)
          this.exact.step();
        if ((this.exact.result.reason as string) === "error") {
          this.finish("error");
          return;
        }
      }
      if (
        !this.search &&
        (!this.exact || this.exact.result.reason !== "running")
      ) {
        this.finish("budget");
        return;
      }
      this.publish();
      this.schedule();
    } catch {
      this.snapshot.error = "Worker 计算异常";
      this.finish("error");
    }
  }
}
