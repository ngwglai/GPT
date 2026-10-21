import { lex, type Token } from "./lexer";
import { parseTokens } from "./parser";
import { analyze, type Analysis } from "./semantic";
import { optimize } from "./optimizer";
import { compileBytecode, type Bytecode } from "./bytecode";
import { LabError, type Diagnostic } from "./diagnostics";
import type { Program } from "./ast";
export interface Compilation {
  tokens: Token[];
  ast?: Program;
  analysis?: Analysis;
  optimized?: Program;
  originalCode?: Bytecode;
  optimizedCode?: Bytecode;
  diagnostics: Diagnostic[];
}
export function compile(source: string): Compilation {
  const result: Compilation = { tokens: [], diagnostics: [] };
  try {
    result.tokens = lex(source);
    result.ast = parseTokens(result.tokens);
    result.analysis = analyze(result.ast);
    result.diagnostics = result.analysis.diagnostics;
    if (!result.diagnostics.length) {
      result.originalCode = compileBytecode(
        result.analysis.program,
        result.analysis.symbols,
      );
      result.optimized = optimize(result.analysis.program);
      result.optimizedCode = compileBytecode(
        result.optimized,
        result.analysis.symbols,
      );
    }
  } catch (error) {
    if (!(error instanceof LabError)) throw error;
    result.diagnostics.push(error.diagnostic);
  }
  return result;
}
