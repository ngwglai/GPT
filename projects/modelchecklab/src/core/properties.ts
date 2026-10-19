import { evaluate } from "./expression";
import type { Model, State, Violation } from "./types";
export function invariantViolation(
  model: Model,
  state: State,
): Violation | undefined {
  for (const p of model.invariants)
    if (evaluate(p.expr, state) !== true)
      return { kind: "invariant", message: `不变量「${p.name}」违反` };
}
export function isTerminal(model: Model, state: State): boolean {
  return evaluate(model.terminal, state) === true;
}
