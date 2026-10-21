import type { Expr, Program, Statement, Value } from "./ast";
import { budget, fail, LabError, LIMITS, MAX_INT } from "./diagnostics";
import { checkAst } from "./parser";
import type { Outcome } from "./runtime";

// Deliberately independent: lexical name environments and recursive AST evaluation.
// No bytecode, VM operators, slots, optimizer, or VM stepping is used here.
export function interpret(
  program: Program,
  maxSteps: number = LIMITS.steps,
  maxOutput: number = LIMITS.output,
): Outcome {
  budget(maxSteps, LIMITS.steps);
  budget(maxOutput, LIMITS.output);
  checkAst(program);
  const root = new Map<string, Value>(),
    scopes = [root],
    output: string[] = [];
  let steps = 0;
  const tick = (node: Expr | Statement) => {
    if (++steps > maxSteps)
      fail("ResourceLimit", "解释器求值预算耗尽", node.span);
  };
  function resolve(name: string, node: Expr | Statement): Map<string, Value> {
    for (let i = scopes.length - 1; i >= 0; i--)
      if (scopes[i].has(name)) return scopes[i];
    return fail("UndeclaredVariable", `变量 ${name} 尚未声明`, node.span);
  }
  function evalExpr(node: Expr): Value {
    tick(node);
    if (node.kind === "literal") return node.value;
    if (node.kind === "variable")
      return resolve(node.name, node).get(node.name)!;
    if (node.kind === "unary") {
      const value = evalExpr(node.operand);
      if (node.op === "!" && typeof value === "boolean") return !value;
      if (node.op === "-" && typeof value === "number")
        return Number(-BigInt(value));
      return fail("TypeMismatch", "一元表达式类型错误", node.span);
    }
    const left = evalExpr(node.left);
    if (node.op === "&&" && left === false) return false;
    if (node.op === "||" && left === true) return true;
    const right = evalExpr(node.right);
    if (node.op === "&&" || node.op === "||") {
      if (typeof left !== "boolean" || typeof right !== "boolean")
        fail("TypeMismatch", "逻辑表达式类型错误", node.span);
      return node.op === "&&" ? left && right : left || right;
    }
    if (node.op === "==" || node.op === "!=") {
      if (typeof left !== typeof right)
        fail("TypeMismatch", "比较表达式类型错误", node.span);
      return node.op === "==" ? left === right : left !== right;
    }
    if (typeof left !== "number" || typeof right !== "number")
      fail("TypeMismatch", "整数表达式类型错误", node.span);
    const a = BigInt(left),
      b = BigInt(right);
    switch (node.op) {
      case "<":
        return a < b;
      case "<=":
        return a <= b;
      case ">":
        return a > b;
      case ">=":
        return a >= b;
    }
    if (node.op === "/" && b === 0n)
      fail("DivisionByZero", "除数不能为零", node.span);
    const result =
      node.op === "+"
        ? a + b
        : node.op === "-"
          ? a - b
          : node.op === "*"
            ? a * b
            : a / b;
    if (result < -BigInt(MAX_INT) || result > BigInt(MAX_INT))
      fail("Overflow", "整数运算溢出", node.span);
    return Number(result);
  }
  function exec(nodes: Statement[], nested = false) {
    if (nested) scopes.push(new Map());
    try {
      for (const node of nodes) {
        tick(node);
        switch (node.kind) {
          case "let": {
            const value = evalExpr(node.value);
            if (scopes.at(-1)!.has(node.name))
              fail("DuplicateDeclaration", "重复声明", node.span);
            scopes.at(-1)!.set(node.name, value);
            break;
          }
          case "assign": {
            const scope = resolve(node.name, node);
            const value = evalExpr(node.value);
            scope.set(node.name, value);
            break;
          }
          case "print": {
            const value = evalExpr(node.value);
            if (output.length >= maxOutput)
              fail("ResourceLimit", "输出行数超限", node.span);
            output.push(String(value));
            break;
          }
          case "if": {
            const condition = evalExpr(node.condition);
            if (typeof condition !== "boolean")
              fail("TypeMismatch", "条件必须为 bool", node.span);
            exec(condition ? node.then : node.otherwise, true);
            break;
          }
        }
      }
    } finally {
      if (nested) scopes.pop();
    }
  }
  try {
    exec(program.body);
    return { output, globals: Object.fromEntries(root) };
  } catch (error) {
    if (!(error instanceof LabError)) throw error;
    return {
      output,
      globals: Object.fromEntries(root),
      error: error.diagnostic,
    };
  }
}
