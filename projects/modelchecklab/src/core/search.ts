import { evaluate } from "./expression";
import { invariantViolation, isTerminal } from "./properties";
import { canonicalState, stateKey } from "./state";
import { applyAction, enabled } from "./transition";
import { reconstruct } from "./trace";
import { parseModel, ResourceError } from "./validation";
import {
  DEFAULT_LIMITS,
  GRAPH_NODES,
  type Limits,
  type Model,
  type Node,
  type Result,
  type State,
  type Status,
  type Violation,
} from "./types";

export interface SearchOptions {
  limits?: Partial<Limits>;
  cancelled?: () => boolean;
  now?: () => number;
  yieldControl?: () => Promise<void>;
  onProgress?: (stats: Result["stats"]) => void;
}
export async function check(
  text: string,
  options: SearchOptions = {},
): Promise<Result> {
  const now = options.now ?? (() => performance.now()),
    start = now();
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const nodes: Node[] = [],
    seen = new Map<string, number>();
  const graph: Result["graph"] = { nodes: [], edges: [], truncated: false };
  let transitions = 0,
    expanded = 0;
  let model: Model | undefined;
  let goals: Result["goals"] = [];
  function stats(): Result["stats"] {
    return {
      states: nodes.length,
      transitions,
      expanded,
      elapsedMs: Math.max(0, now() - start),
    };
  }
  function finish(
    status: Status,
    reason: string,
    complete = false,
    violation?: Violation,
    id?: number,
  ): Result {
    if (complete)
      goals = goals.map((g) =>
        g.status === "unknown" ? { ...g, status: "unreachable" } : g,
      );
    return {
      status,
      reason,
      complete,
      stats: stats(),
      goals,
      trace: id === undefined ? [] : reconstruct(nodes, id),
      violation,
      graph,
      model,
      limits,
    };
  }
  try {
    model = parseModel(text);
  } catch (e) {
    return finish(
      e instanceof ResourceError ? "inconclusive" : "invalid_model",
      (e as Error).message,
    );
  }
  goals = model.goals.map((g) => ({
    name: g.name,
    status: "unknown",
    witness: [],
  }));
  for (const k of ["states", "transitions", "timeMs"] as const) {
    if (
      !Number.isSafeInteger(limits[k]) ||
      limits[k] < 0 ||
      limits[k] > DEFAULT_LIMITS[k]
    )
      return finish(
        "inconclusive",
        `预算 ${k} 必须为 0–${DEFAULT_LIMITS[k]} 的整数`,
      );
  }
  const names = Object.keys(model.variables).sort();
  const actions = [...model.actions].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  const interrupt = (): string | undefined =>
    options.cancelled?.()
      ? "检验已取消"
      : now() - start >= limits.timeMs
        ? "计算时间预算耗尽"
        : undefined;
  function add(
    state: State,
    parent: number | null,
    action: string | null,
  ): number | undefined {
    const key = stateKey(state, names),
      existing = seen.get(key);
    if (existing !== undefined) return existing;
    if (nodes.length >= limits.states) return;
    const id = nodes.length,
      s = canonicalState(state, names);
    seen.set(key, id);
    nodes.push({ state: s, parent, action });
    if (id < GRAPH_NODES) graph.nodes.push({ id, state: s });
    else graph.truncated = true;
    return id;
  }
  for (const initial of model.initial) {
    const why = interrupt();
    if (why) return finish("inconclusive", why);
    if (add(initial, null, null) === undefined)
      return finish("inconclusive", "状态预算耗尽");
  }
  for (let head = 0; head < nodes.length; head++) {
    if (head % 64 === 0) {
      options.onProgress?.(stats());
      await (options.yieldControl?.() ??
        new Promise<void>((resolve) => setTimeout(resolve, 0)));
    }
    const why = interrupt();
    if (why) return finish("inconclusive", why);
    const state = nodes[head].state;
    try {
      for (let i = 0; i < model.goals.length; i++) {
        if (
          goals[i].status === "unknown" &&
          evaluate(model.goals[i].expr, state) === true
        ) {
          const witness = reconstruct(nodes, head);
          goals[i] = {
            name: goals[i].name,
            status: "reachable",
            witness: witness.length <= 1000 ? witness : [],
            witnessOmitted: witness.length > 1000,
          };
        }
      }
      const violation = invariantViolation(model, state);
      if (violation)
        return finish(
          "counterexample",
          violation.message,
          false,
          violation,
          head,
        );
      if (isTerminal(model, state)) {
        expanded++;
        continue;
      }
      let successors = 0;
      for (const action of actions) {
        const reason = interrupt();
        if (reason) return finish("inconclusive", reason);
        if (!enabled(action, state)) continue;
        if (transitions >= limits.transitions)
          return finish("inconclusive", "转移预算耗尽");
        let next: State;
        try {
          next = applyAction(action, state, model);
        } catch (e) {
          const v: Violation = {
            kind: "action_error",
            message: (e as Error).message,
            action: action.name,
          };
          return finish("counterexample", v.message, false, v, head);
        }
        transitions++;
        successors++;
        const id = add(next, head, action.name);
        if (id === undefined) return finish("inconclusive", "状态预算耗尽");
        if (head < GRAPH_NODES && id < GRAPH_NODES && graph.edges.length < 2000)
          graph.edges.push({ from: head, to: id, action: action.name });
        else graph.truncated = true;
      }
      if (!successors) {
        const v: Violation = {
          kind: "deadlock",
          message: "非终止状态没有合法后继：发现死锁",
        };
        return finish("counterexample", v.message, false, v, head);
      }
      expanded++;
    } catch (e) {
      const v: Violation = {
        kind: "evaluation_error",
        message: `模型语义计算错误：${(e as Error).message}`,
      };
      return finish("counterexample", v.message, false, v, head);
    }
  }
  const why = interrupt();
  if (why) return finish("inconclusive", why);
  return finish(
    "verified",
    "完整探索完成：指定不变量和非终止死锁检查通过",
    true,
  );
}
