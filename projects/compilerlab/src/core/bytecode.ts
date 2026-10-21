import type {
  BinaryOp,
  Expr,
  Program,
  Span,
  Statement,
  UnaryOp,
  Value,
} from "./ast";
import { fail, LIMITS } from "./diagnostics";
import { checkAst } from "./parser";
import type { SymbolInfo } from "./semantic";
export type Instruction = { span: Span } & (
  | { op: "PUSH"; value: Value }
  | { op: "LOAD" | "DECLARE" | "STORE"; slot: number }
  | { op: "UNARY"; operator: UnaryOp }
  | { op: "BINARY"; operator: BinaryOp }
  | { op: "JUMP" | "JUMP_FALSE" | "AND" | "OR"; target: number }
  | { op: "PRINT" | "ENTER" | "LEAVE" | "HALT" }
);
export interface Bytecode {
  instructions: Instruction[];
  symbols: SymbolInfo[];
}
export function compileBytecode(
  program: Program,
  symbols: SymbolInfo[],
): Bytecode {
  checkAst(program);
  const instructions: Instruction[] = [];
  function emit(instruction: Instruction): number {
    if (instructions.length >= LIMITS.instructions)
      fail("ResourceLimit", "字节码指令数超限", instruction.span);
    instructions.push(instruction);
    return instructions.length - 1;
  }
  function slot(node: { slot?: number; span: Span }): number {
    if (node.slot === undefined || !symbols[node.slot])
      fail("InvalidBytecode", "必须先通过语义检查", node.span);
    return node.slot;
  }
  function patch(index: number) {
    const instruction = instructions[index];
    if ("target" in instruction) instruction.target = instructions.length;
  }
  function expr(node: Expr) {
    switch (node.kind) {
      case "literal":
        emit({ op: "PUSH", value: node.value, span: node.span });
        break;
      case "variable":
        emit({ op: "LOAD", slot: slot(node), span: node.span });
        break;
      case "unary":
        expr(node.operand);
        emit({ op: "UNARY", operator: node.op, span: node.span });
        break;
      case "binary": {
        expr(node.left);
        if (node.op === "&&" || node.op === "||") {
          const jump = emit({
            op: node.op === "&&" ? "AND" : "OR",
            target: -1,
            span: node.span,
          });
          expr(node.right);
          patch(jump);
        } else {
          expr(node.right);
          emit({ op: "BINARY", operator: node.op, span: node.span });
        }
        break;
      }
    }
  }
  function block(nodes: Statement[], span: Span) {
    emit({ op: "ENTER", span });
    nodes.forEach(statement);
    emit({ op: "LEAVE", span });
  }
  function statement(node: Statement) {
    switch (node.kind) {
      case "let":
      case "assign":
        expr(node.value);
        emit({
          op: node.kind === "let" ? "DECLARE" : "STORE",
          slot: slot(node),
          span: node.span,
        });
        break;
      case "print":
        expr(node.value);
        emit({ op: "PRINT", span: node.span });
        break;
      case "if": {
        expr(node.condition);
        const branch = emit({
          op: "JUMP_FALSE",
          target: -1,
          span: node.condition.span,
        });
        block(node.then, node.span);
        const end = emit({ op: "JUMP", target: -1, span: node.span });
        patch(branch);
        block(node.otherwise, node.span);
        patch(end);
        break;
      }
    }
  }
  program.body.forEach(statement);
  emit({ op: "HALT", span: program.span });
  return { instructions, symbols: structuredClone(symbols) };
}
export function formatInstruction(instruction: Instruction): string {
  const arg =
    "value" in instruction
      ? instruction.value
      : "slot" in instruction
        ? `#${instruction.slot}`
        : "operator" in instruction
          ? instruction.operator
          : "target" in instruction
            ? instruction.target
            : "";
  return `${instruction.op} ${arg}`.trim();
}
