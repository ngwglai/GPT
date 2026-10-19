import { it, expect } from "vitest";
import { Runner } from "../src/runtime/runner";
import type { Scheduler } from "../src/runtime/runner";
import type { Reply } from "../src/runtime/protocol";
import { defaultConfig } from "../src/core/types";
import type { BatchConfig } from "../src/core/types";
class Clock implements Scheduler {
  time = 0;
  serial = 0;
  queue = new Map<number, () => void>();
  now() {
    return this.time;
  }
  schedule(fn: () => void) {
    this.queue.set(++this.serial, fn);
    return this.serial;
  }
  clear(handle: unknown) {
    this.queue.delete(handle as number);
  }
  tick() {
    const entry = this.queue.entries().next().value;
    if (!entry) return;
    this.queue.delete(entry[0]);
    entry[1]();
  }
  drain() {
    for (let i = 0; this.queue.size && i < 10000; i++) this.tick();
    expect(this.queue.size).toBe(0);
  }
}
function setup(config: BatchConfig = structuredClone(defaultConfig)) {
  const clock = new Clock(),
    replies: Reply[] = [];
  const runner = new Runner((r) => replies.push(r), clock);
  runner.command({ type: "start", id: "job-1", config });
  return { clock, runner, replies };
}
it("batch runs three strategies and two seeds with equal per-run budgets then exact", () => {
  const c = structuredClone(defaultConfig);
  c.compare = true;
  c.seeds = [42, 43];
  c.experiment.budget = 70;
  c.experiment.space = { kind: "sort", mode: "permutation", size: 4, range: 0 };
  const { clock, runner } = setup(c);
  clock.drain();
  expect(runner.snapshot.status).toBe("budget");
  expect(runner.snapshot.results).toHaveLength(6);
  for (const r of runner.snapshot.results) expect(r.evaluations).toBe(70);
  expect(runner.snapshot.exact?.complete).toBe(true);
  expect(runner.snapshot.exact?.evaluated).toBe(24);
});
it("pause stops scheduling and excludes paused wall time; resume reproduces result", () => {
  const config = structuredClone(defaultConfig);
  config.exact = false;
  const { clock, runner, replies } = setup(config);
  clock.tick();
  runner.command({ type: "pause", id: "job-1" });
  const checkpoint = structuredClone(replies.at(-1));
  expect(clock.queue.size).toBe(0);
  clock.time += 100000;
  clock.tick();
  expect(replies.at(-1)).toEqual(checkpoint);
  runner.command({ type: "resume", id: "job-1" });
  clock.drain();
  const other = setup(config);
  other.clock.drain();
  expect(runner.snapshot.results).toEqual(other.runner.snapshot.results);
});
it.each(["running", "paused"] as const)(
  "cancel from %s performs no further work",
  (state) => {
    const { clock, runner } = setup();
    clock.tick();
    if (state === "paused") runner.command({ type: "pause", id: "job-1" });
    const n = runner.snapshot.current!.evaluations;
    runner.command({ type: "cancel", id: "job-1" });
    expect(clock.queue.size).toBe(0);
    clock.drain();
    expect(runner.snapshot.status).toBe("cancelled");
    expect(runner.snapshot.results[0].evaluations).toBe(n);
    expect(runner.snapshot.results[0].termination).toBe("cancelled");
  },
);
it("stale task controls cannot cancel a new task, and active start cannot overwrite", () => {
  const { clock, runner } = setup();
  runner.command({ type: "start", id: "job-2", config: defaultConfig });
  runner.command({ type: "cancel", id: "job-2" });
  expect(runner.snapshot.status).toBe("running");
  runner.command({ type: "cancel", id: "job-1" });
  runner.command({
    type: "start",
    id: "job-2",
    config: { ...defaultConfig, exact: false },
  });
  runner.command({ type: "cancel", id: "job-1" });
  clock.drain();
  expect(runner.snapshot.status).toBe("budget");
});
it("timeout reports actual checkpoint without claiming completion", () => {
  const { clock, runner } = setup();
  clock.tick();
  clock.time = 15000;
  clock.tick();
  expect(runner.snapshot.status).toBe("timeout");
  expect(runner.snapshot.results[0].evaluations).toBe(32);
  expect(runner.snapshot.results[0].termination).toBe("timeout");
});
it("timeout before first candidate records zero actual evaluations", () => {
  const { clock, runner } = setup();
  clock.time = 15000;
  clock.tick();
  expect(runner.snapshot.status).toBe("timeout");
  expect(runner.snapshot.results[0].evaluations).toBe(0);
  expect(runner.snapshot.results[0].best).toBeNull();
});
it("cancel during exact enumeration leaves heuristic runs complete and optimum unknown", () => {
  const c = structuredClone(defaultConfig);
  c.experiment.budget = 1;
  const { clock, runner } = setup(c);
  clock.tick();
  clock.tick();
  runner.command({ type: "cancel", id: "job-1" });
  expect(runner.snapshot.results[0].termination).toBe("budget");
  expect(runner.snapshot.exact?.reason).toBe("cancelled");
  expect(runner.snapshot.exact?.complete).toBe(false);
  expect(runner.snapshot.exact?.optimum).toBeNull();
});
it("invalid config is an error with no fabricated results", () => {
  const c = structuredClone(defaultConfig);
  c.experiment.budget = 0;
  const { clock, runner } = setup(c);
  expect(runner.snapshot.status).toBe("error");
  expect(runner.snapshot.results).toEqual([]);
  expect(clock.queue.size).toBe(0);
});

it("cancel after budget completion does not rewrite the termination", () => {
  const c = structuredClone(defaultConfig);
  c.exact = false;
  c.experiment.budget = 1;
  const { clock, runner } = setup(c);
  clock.drain();
  runner.command({ type: "cancel", id: "job-1" });
  expect(runner.snapshot.status).toBe("budget");
  expect(runner.snapshot.results[0].termination).toBe("budget");
});
