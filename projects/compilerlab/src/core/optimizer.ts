import type { Expr, Program, Statement } from "./ast";
import { LabError } from "./diagnostics";
import { checkAst } from "./parser";
import { binary, unary } from "./runtime";
export function optimize(program: Program): Program {
  checkAst(program);
  function expr(node: Expr): Expr {
    if (node.kind === "unary") {
      const operand = expr(node.operand);
      if (operand.kind === "literal") {
        try {
          return {
            kind: "literal",
            value: unary(node.op, operand.value, node.span),
            span: node.span,
          };
        } catch (error) {
          if (!(error instanceof LabError)) throw error;
        }
      }
      return { ...node, operand };
    }
    if (node.kind !== "binary") return { ...node };
    const left = expr(node.left);
    if (
      left.kind === "literal" &&
      ((node.op === "&&" && left.value === false) ||
        (node.op === "||" && left.value === true))
    ) {
      return { ...left, span: node.span };
    }
    const right = expr(node.right);
    if (left.kind === "literal" && right.kind === "literal") {
      try {
        return {
          kind: "literal",
          value: binary(node.op, left.value, right.value, node.span),
          span: node.span,
        };
      } catch (error) {
        if (!(error instanceof LabError)) throw error;
      }
    }
    // Only left constants permit removing an operand: rhs always evaluated here.
    if (
      left.kind === "literal" &&
      ((node.op === "&&" && left.value === true) ||
        (node.op === "||" && left.value === false))
    )
      return right;
    return { ...node, left, right };
  }
  function statement(node: Statement): Statement {
    if (node.kind === "if")
      return {
        ...node,
        condition: expr(node.condition),
        then: node.then.map(statement),
        otherwise: node.otherwise.map(statement),
      };
    return { ...node, value: expr(node.value) };
  }
  return { ...program, body: program.body.map(statement) };
}
