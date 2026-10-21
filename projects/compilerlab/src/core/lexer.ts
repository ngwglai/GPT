import type { Span } from "./ast";
import { fail, LIMITS, origin } from "./diagnostics";
export interface Token {
  kind:
    | "keyword"
    | "identifier"
    | "integer"
    | "operator"
    | "punctuation"
    | "eof";
  text: string;
  span: Span;
}
const keywords = new Set([
  "let",
  "int",
  "bool",
  "true",
  "false",
  "if",
  "else",
  "print",
]);
export function lex(source: string): Token[] {
  if (source.length > LIMITS.source)
    fail("ResourceLimit", `源码超过 ${LIMITS.source} 字符`, origin);
  const tokens: Token[] = [];
  let offset = 0,
    line = 1,
    column = 1;
  const pos = () => ({ offset, line, column });
  function advance() {
    const c = source[offset++];
    if (c === "\r") {
      if (source[offset] === "\n") offset++;
      line++;
      column = 1;
    } else if (c === "\n") {
      line++;
      column = 1;
    } else column++;
  }
  while (offset < source.length) {
    const c = source[offset];
    if (/\s/.test(c)) {
      advance();
      continue;
    }
    if (source.slice(offset, offset + 2) === "//") {
      while (offset < source.length && !/[\r\n]/.test(source[offset]))
        advance();
      continue;
    }
    const start = pos();
    let kind: Token["kind"];
    if (/[A-Za-z_]/.test(c)) {
      while (offset < source.length && /[A-Za-z0-9_]/.test(source[offset]))
        advance();
      kind = keywords.has(source.slice(start.offset, offset))
        ? "keyword"
        : "identifier";
    } else if (/[0-9]/.test(c)) {
      while (offset < source.length && /[0-9]/.test(source[offset])) advance();
      kind = "integer";
    } else if (
      ["==", "!=", "<=", ">=", "&&", "||"].includes(
        source.slice(offset, offset + 2),
      )
    ) {
      advance();
      advance();
      kind = "operator";
    } else if ("+-*/!<>= ".includes(c)) {
      advance();
      kind = "operator";
    } else if ("(){}:;".includes(c)) {
      advance();
      kind = "punctuation";
    } else {
      advance();
      fail("LexicalError", "无法识别的字符", { start, end: pos() });
    }
    tokens.push({
      kind,
      text: source.slice(start.offset, offset),
      span: { start, end: pos() },
    });
    if (tokens.length >= LIMITS.tokens)
      fail("ResourceLimit", "Token 数量超限", tokens.at(-1)!.span);
  }
  tokens.push({ kind: "eof", text: "", span: { start: pos(), end: pos() } });
  return tokens;
}
