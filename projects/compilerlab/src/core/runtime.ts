import type { BinaryOp, Span, UnaryOp, Value } from "./ast";
import { fail, MAX_INT, type Diagnostic } from "./diagnostics";
export interface Outcome {
  output: string[];
  globals: Record<string, Value>;
  error?: Diagnostic;
}
export function checked(value: bigint, span: Span): number {
  if (value < -BigInt(MAX_INT) || value > BigInt(MAX_INT))
    fail("Overflow", "整数运算溢出", span);
  return Number(value);
}
export function isValue(value: unknown): value is Value {
  return (
    typeof value === "boolean" ||
    (typeof value === "number" &&
      Number.isInteger(value) &&
      Math.abs(value) <= MAX_INT)
  );
}
export function unary(op: UnaryOp, value: Value, span: Span): Value {
  if (op === "!" && typeof value === "boolean") return !value;
  if (op === "-" && typeof value === "number")
    return checked(-BigInt(value), span);
  return fail("InvalidBytecode", "一元指令类型无效", span);
}
export function binary(
  op: BinaryOp,
  left: Value,
  right: Value,
  span: Span,
): Value {
  if (op === "==" || op === "!=") {
    if (typeof left !== typeof right)
      fail("InvalidBytecode", "比较指令类型不匹配", span);
    return op === "==" ? left === right : left !== right;
  }
  if (op === "&&" || op === "||") {
    if (typeof left !== "boolean" || typeof right !== "boolean")
      fail("InvalidBytecode", "逻辑指令类型无效", span);
    return op === "&&" ? left && right : left || right;
  }
  if (typeof left !== "number" || typeof right !== "number")
    fail("InvalidBytecode", "整数指令类型无效", span);
  const a = BigInt(left),
    b = BigInt(right);
  switch (op) {
    case "+":
      return checked(a + b, span);
    case "-":
      return checked(a - b, span);
    case "*":
      return checked(a * b, span);
    case "/":
      if (b === 0n) fail("DivisionByZero", "除数不能为零", span);
      return checked(a / b, span);
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
  }
  return fail("InvalidBytecode", "未知二元运算指令", span);
}
