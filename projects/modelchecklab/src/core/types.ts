export type Value = number | boolean | string;
export type State = Record<string, Value>;
export type Op =
  | "+"
  | "-"
  | "*"
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "and"
  | "or"
  | "not";
export type Expr = Value | { var: string } | { op: Op; args: Expr[] };
export type Domain =
  | { type: "int"; min: number; max: number }
  | { type: "bool" }
  | { type: "enum"; values: string[] };
export interface Action {
  name: string;
  guard: Expr;
  set: Record<string, Expr>;
}
export interface Property {
  name: string;
  expr: Expr;
}
export interface Model {
  name: string;
  variables: Record<string, Domain>;
  initial: State[];
  actions: Action[];
  invariants: Property[];
  terminal: Expr;
  goals: Property[];
}
export interface Limits {
  states: number;
  transitions: number;
  timeMs: number;
}
export const DEFAULT_LIMITS: Limits = {
  states: 50_000,
  transitions: 200_000,
  timeMs: 15_000,
};
export const INPUT_BYTES = 65_536;
export const GRAPH_NODES = 500;
export type Status =
  | "verified"
  | "counterexample"
  | "inconclusive"
  | "invalid_model";
export interface Step {
  state: State;
  action: string | null;
}
export interface Violation {
  kind: "invariant" | "deadlock" | "action_error" | "evaluation_error";
  message: string;
  action?: string;
}
export interface Result {
  status: Status;
  reason: string;
  complete: boolean;
  stats: {
    states: number;
    transitions: number;
    expanded: number;
    elapsedMs: number;
  };
  goals: {
    name: string;
    status: "reachable" | "unreachable" | "unknown";
    witness: Step[];
    witnessOmitted?: boolean;
  }[];
  violation?: Violation;
  trace: Step[];
  graph: {
    nodes: { id: number; state: State }[];
    edges: { from: number; to: number; action: string }[];
    truncated: boolean;
  };
  // Exported once with the result so the exact input and checks can be reproduced.
  model?: Model;
  limits: Limits;
}
export interface Node {
  state: State;
  parent: number | null;
  action: string | null;
}
