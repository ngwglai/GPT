import type { Expr, Program, Span, Statement, Type } from "./ast";
import { type Diagnostic, fail, LIMITS } from "./diagnostics";
import { checkAst } from "./parser";
export interface SymbolInfo {
  id: number;
  name: string;
  type: Type;
  depth: number;
  span: Span;
}
export interface Analysis {
  program: Program;
  symbols: SymbolInfo[];
  diagnostics: Diagnostic[];
}
export function analyze(input: Program): Analysis {
  checkAst(input);
  const program = structuredClone(input),
    symbols: SymbolInfo[] = [],
    diagnostics: Diagnostic[] = [];
  const scopes: Map<string, SymbolInfo>[] = [new Map()];
  function report(code: Diagnostic["code"], message: string, span: Span) {
    diagnostics.push({ code, message, span });
  }
  function lookup(name: string, span: Span): SymbolInfo | undefined {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const found = scopes[i].get(name);
      if (found) return found;
    }
    report("UndeclaredVariable", `变量 ${name} 尚未声明`, span);
  }
  function expect(actual: Type | undefined, required: Type, span: Span) {
    if (actual && actual !== required)
      report("TypeMismatch", `需要 ${required}，实际为 ${actual}`, span);
  }
  function expr(node: Expr): Type | undefined {
    switch (node.kind) {
      case "literal":
        return typeof node.value === "boolean" ? "bool" : "int";
      case "variable": {
        const symbol = lookup(node.name, node.span);
        node.slot = symbol?.id;
        return symbol?.type;
      }
      case "unary": {
        const type = node.op === "!" ? "bool" : "int";
        expect(expr(node.operand), type, node.span);
        return type;
      }
      case "binary": {
        const left = expr(node.left),
          right = expr(node.right);
        if (node.op === "==" || node.op === "!=") {
          if (left && right && left !== right)
            report("TypeMismatch", "相等比较两端必须同型", node.span);
          return "bool";
        }
        const type = node.op === "&&" || node.op === "||" ? "bool" : "int";
        expect(left, type, node.left.span);
        expect(right, type, node.right.span);
        return ["+", "-", "*", "/"].includes(node.op) ? "int" : "bool";
      }
    }
  }
  function body(nodes: Statement[], nested = false) {
    if (nested) scopes.push(new Map());
    for (const node of nodes) {
      switch (node.kind) {
        case "let": {
          expect(expr(node.value), node.type, node.value.span);
          const scope = scopes.at(-1)!;
          if (scope.has(node.name))
            report(
              "DuplicateDeclaration",
              `本作用域重复声明 ${node.name}`,
              node.span,
            );
          else {
            if (symbols.length >= LIMITS.symbols)
              fail("ResourceLimit", "变量声明数量超限", node.span);
            const symbol = {
              id: symbols.length,
              name: node.name,
              type: node.type,
              depth: scopes.length - 1,
              span: node.span,
            };
            node.slot = symbol.id;
            scope.set(node.name, symbol);
            symbols.push(symbol);
          }
          break;
        }
        case "assign": {
          const symbol = lookup(node.name, node.span);
          node.slot = symbol?.id;
          const actual = expr(node.value);
          if (symbol) expect(actual, symbol.type, node.span);
          break;
        }
        case "print":
          expr(node.value);
          break;
        case "if":
          expect(expr(node.condition), "bool", node.condition.span);
          body(node.then, true);
          body(node.otherwise, true);
          break;
      }
    }
    if (nested) scopes.pop();
  }
  body(program.body);
  return { program, symbols, diagnostics };
}
