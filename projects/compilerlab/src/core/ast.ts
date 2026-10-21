export type Value = number | boolean;
export type Type = "int" | "bool";
export interface Position {
  offset: number;
  line: number;
  column: number;
}
export interface Span {
  start: Position;
  end: Position;
}
export interface Node {
  span: Span;
}
export type UnaryOp = "-" | "!";
export type BinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "&&"
  | "||";
export type Expr =
  | (Node & { kind: "literal"; value: Value })
  | (Node & { kind: "variable"; name: string; slot?: number })
  | (Node & { kind: "unary"; op: UnaryOp; operand: Expr })
  | (Node & { kind: "binary"; op: BinaryOp; left: Expr; right: Expr });
export type Statement =
  | (Node & {
      kind: "let";
      name: string;
      type: Type;
      value: Expr;
      slot?: number;
    })
  | (Node & { kind: "assign"; name: string; value: Expr; slot?: number })
  | (Node & { kind: "print"; value: Expr })
  | (Node & {
      kind: "if";
      condition: Expr;
      then: Statement[];
      otherwise: Statement[];
    });
export interface Program extends Node {
  kind: "program";
  body: Statement[];
}
export type AstNode = Program | Statement | Expr;
export function children(node: AstNode): AstNode[] {
  switch (node.kind) {
    case "program":
      return node.body;
    case "let":
    case "assign":
    case "print":
      return [node.value];
    case "if":
      return [node.condition, ...node.then, ...node.otherwise];
    case "unary":
      return [node.operand];
    case "binary":
      return [node.left, node.right];
    default:
      return [];
  }
}
export function label(node: AstNode): string {
  switch (node.kind) {
    case "program":
      return "Program";
    case "literal":
      return `Literal ${node.value}`;
    case "variable":
      return `变量 ${node.name}`;
    case "unary":
    case "binary":
      return `${node.kind} ${node.op}`;
    case "let":
      return `let ${node.name}: ${node.type}`;
    case "assign":
      return `赋值 ${node.name}`;
    case "print":
      return "print";
    case "if":
      return `if（then ${node.then.length} / else ${node.otherwise.length}）`;
  }
}
