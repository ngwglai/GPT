import type { Span } from "./ast";
export const LIMITS = Object.freeze({
  source: 8192,
  tokens: 2048,
  nodes: 512,
  depth: 32,
  symbols: 128,
  instructions: 2048,
  steps: 4096,
  output: 256,
});
export const MAX_INT = 2147483647;
export type ErrorCode =
  | "LexicalError"
  | "SyntaxError"
  | "UndeclaredVariable"
  | "DuplicateDeclaration"
  | "TypeMismatch"
  | "IntegerRange"
  | "DivisionByZero"
  | "Overflow"
  | "ResourceLimit"
  | "InvalidBytecode";
export interface Diagnostic {
  code: ErrorCode;
  message: string;
  span: Span;
}
export const origin: Span = {
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 0, line: 1, column: 1 },
};
export class LabError extends Error {
  readonly diagnostic: Diagnostic;
  constructor(code: ErrorCode, message: string, span: Span = origin) {
    super(message);
    this.name = "LabError";
    this.diagnostic = { code, message, span };
  }
}
export function fail(
  code: ErrorCode,
  message: string,
  span: Span = origin,
): never {
  throw new LabError(code, message, span);
}
export function budget(value: number, maximum: number): number {
  if (!Number.isInteger(value) || value < 1 || value > maximum)
    fail("ResourceLimit", `预算必须为 1–${maximum} 的整数`);
  return value;
}
