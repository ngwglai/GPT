import {
  children,
  type AstNode,
  type BinaryOp,
  type Expr,
  type Program,
  type Statement,
  type Type,
} from "./ast";
import { fail, LIMITS, MAX_INT } from "./diagnostics";
import { lex, type Token } from "./lexer";
const precedence: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
};
export function checkAst(program: Program) {
  const pending: [AstNode, number][] = [[program, 0]];
  let count = 0;
  while (pending.length) {
    const [node, depth] = pending.pop()!;
    if (++count > LIMITS.nodes || depth > LIMITS.depth)
      fail("ResourceLimit", "AST 节点数或深度超限", node.span);
    for (const child of children(node)) pending.push([child, depth + 1]);
  }
}
export function parse(source: string): Program {
  return parseTokens(lex(source));
}
export function parseTokens(tokens: Token[]): Program {
  if (
    !tokens.length ||
    tokens.at(-1)!.kind !== "eof" ||
    tokens.length > LIMITS.tokens
  )
    fail("SyntaxError", "缺少 EOF 或 Token 超限");
  let index = 0,
    nesting = 0;
  const current = () => tokens[index];
  function take(text: string): Token {
    const token = current();
    if (token.text !== text) fail("SyntaxError", `需要“${text}”`, token.span);
    index++;
    return token;
  }
  function identifier(): Token {
    if (current().kind !== "identifier")
      fail("SyntaxError", "需要变量名", current().span);
    return tokens[index++];
  }
  function enter() {
    if (++nesting > LIMITS.depth)
      fail("ResourceLimit", "语法嵌套超限", current().span);
  }
  function expression(min = 1): Expr {
    enter();
    let left: Expr;
    const token = current();
    if (token.text === "-" || token.text === "!") {
      index++;
      const operand = expression(7);
      left = {
        kind: "unary",
        op: token.text,
        operand,
        span: { start: token.span.start, end: operand.span.end },
      };
    } else if (token.text === "(") {
      index++;
      left = expression();
      take(")");
    } else if (token.kind === "integer") {
      const value = Number(token.text);
      if (!Number.isSafeInteger(value) || value > MAX_INT)
        fail("IntegerRange", "整数字面量超出范围", token.span);
      index++;
      left = { kind: "literal", value, span: token.span };
    } else if (token.text === "true" || token.text === "false") {
      index++;
      left = {
        kind: "literal",
        value: token.text === "true",
        span: token.span,
      };
    } else if (token.kind === "identifier") {
      index++;
      left = { kind: "variable", name: token.text, span: token.span };
    } else fail("SyntaxError", "需要表达式", token.span);
    while ((precedence[current().text] ?? 0) >= min) {
      const op = tokens[index++].text as BinaryOp;
      const right = expression(precedence[op] + 1);
      left = {
        kind: "binary",
        op,
        left,
        right,
        span: { start: left.span.start, end: right.span.end },
      };
    }
    nesting--;
    return left;
  }
  function block(): Statement[] {
    enter();
    take("{");
    const body: Statement[] = [];
    while (current().text !== "}" && current().kind !== "eof")
      body.push(statement());
    take("}");
    nesting--;
    return body;
  }
  function statement(): Statement {
    const start = current().span.start;
    if (current().text === "if") {
      index++;
      take("(");
      const condition = expression();
      take(")");
      const then = block();
      let otherwise: Statement[] = [];
      if (current().text === "else") {
        index++;
        otherwise = block();
      }
      return {
        kind: "if",
        condition,
        then,
        otherwise,
        span: { start, end: tokens[index - 1].span.end },
      };
    }
    if (current().text === "let") {
      index++;
      const name = identifier().text;
      take(":");
      const type = current();
      if (type.text !== "int" && type.text !== "bool")
        fail("SyntaxError", "需要 int 或 bool 类型", type.span);
      index++;
      take("=");
      const value = expression();
      const end = take(";").span.end;
      return {
        kind: "let",
        name,
        type: type.text as Type,
        value,
        span: { start, end },
      };
    }
    if (current().text === "print") {
      index++;
      take("(");
      const value = expression();
      take(")");
      const end = take(";").span.end;
      return { kind: "print", value, span: { start, end } };
    }
    const name = identifier().text;
    take("=");
    const value = expression();
    const end = take(";").span.end;
    return { kind: "assign", name, value, span: { start, end } };
  }
  const start = current().span.start;
  const body: Statement[] = [];
  while (current().kind !== "eof") body.push(statement());
  const program: Program = {
    kind: "program",
    body,
    span: { start, end: current().span.end },
  };
  checkAst(program);
  return program;
}
