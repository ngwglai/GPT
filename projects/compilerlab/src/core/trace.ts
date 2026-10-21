import type { Value } from "./ast";
import type { Instruction } from "./bytecode";
import type { Diagnostic } from "./diagnostics";
export interface Snapshot {
  pc: number;
  stack: Value[];
  variables: Record<string, Value>;
  output: string[];
  done: boolean;
}
export interface TraceEntry {
  step: number;
  instruction?: Instruction;
  before: Snapshot;
  after: Snapshot;
  error?: Diagnostic;
}
