import { DEFAULT_LIMITS, type Limits, type Result } from "./core/types";
export type Request =
  | { type: "run"; text: string; limits: Limits }
  | { type: "cancel" };
export type Response =
  | { type: "result"; result: Result }
  | { type: "progress"; stats: Result["stats"] };
export function interruptedResult(
  reason: string,
  stats?: Result["stats"],
  limits = DEFAULT_LIMITS,
): Result {
  return {
    status: "inconclusive",
    reason,
    complete: false,
    stats: stats ?? { states: 0, transitions: 0, expanded: 0, elapsedMs: 0 },
    goals: [],
    trace: [],
    graph: { nodes: [], edges: [], truncated: true },
    limits,
  };
}
