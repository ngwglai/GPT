import type { Expr, State, Value } from "./types";

// Only this closed AST is interpreted. No source code or property traversal.
export function evaluate(expr: Expr, state: State): Value {
  if (typeof expr !== "object") return expr;
  if ("var" in expr) return state[expr.var];
  const a = expr.args.map((x) => evaluate(x, state));
  let result: Value;
  switch (expr.op) {
    case "+":
      result = (a[0] as number) + (a[1] as number);
      break;
    case "-":
      result = (a[0] as number) - (a[1] as number);
      break;
    case "*":
      result = (a[0] as number) * (a[1] as number);
      break;
    case "==":
      return a[0] === a[1];
    case "!=":
      return a[0] !== a[1];
    case "<":
      return (a[0] as number) < (a[1] as number);
    case "<=":
      return (a[0] as number) <= (a[1] as number);
    case ">":
      return (a[0] as number) > (a[1] as number);
    case ">=":
      return (a[0] as number) >= (a[1] as number);
    case "and":
      return a.every((x) => x === true);
    case "or":
      return a.some((x) => x === true);
    case "not":
      return !a[0];
  }
  if (typeof result === "number" && !Number.isSafeInteger(result))
    throw new Error("整数运算超出安全整数范围");
  return result;
}
