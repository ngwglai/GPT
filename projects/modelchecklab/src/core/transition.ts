import { evaluate, SemanticError } from "./expression";
import { inDomain } from "./state";
import type { Action, Model, State } from "./types";

export function enabled(action: Action, state: State): boolean {
  return evaluate(action.guard, state) === true;
}
export function applyAction(action: Action, state: State, model: Model): State {
  const next = { ...state };
  // Every right-hand side reads the same pre-state; assignments are atomic.
  for (const name of Object.keys(action.set).sort()) {
    const value = evaluate(action.set[name], state);
    if (!inDomain(value, model.variables[name]))
      throw new SemanticError(
        `动作「${action.name}」使变量 ${name} 越界或产生域外值`,
      );
    next[name] = value;
  }
  return next;
}
