import { INPUT_LIMIT, OPS, integer, keys, parseExpr, record } from './dsl';
import type { Expr, Op } from './dsl';
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const NAMES = ['Max2', 'Abs', 'Clamp', 'Sign'] as const;
export type Name = typeof NAMES[number];
export type Spec = { kind: 'builtin'; name: Name } | { kind: 'expression'; ast: Expr };
export interface Example { input: number[]; output: number }
export interface Budget { maxNodes: number; maxCandidates: number; maxStored: number; timeMs: number; maxIterations: number; verifyLimit: number }
export interface Config {
  version: 1; variables: number; constants: number[]; operators: Op[];
  examples: Example[]; domain: { min: number; max: number }; spec: Spec; budget: Budget;
}
export function parseConfig(v: unknown): Config {
  const c = record(v); keys(c, ['version', 'variables', 'constants', 'operators', 'examples', 'domain', 'spec', 'budget']);
  if (c.version !== 1) throw new Error('不支持的配置版本');
  const variables = integer(c.variables, 1, 2);
  if (!Array.isArray(c.constants) || c.constants.length < 1 || c.constants.length > 8) throw new Error('常量数量必须为 1…8');
  const constants = c.constants.map(v => integer(v, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER));
  if (new Set(constants).size !== constants.length) throw new Error('常量不能重复');
  if (!Array.isArray(c.operators) || c.operators.length > OPS.length || c.operators.some(v => !OPS.includes(v)) || new Set(c.operators).size !== c.operators.length) throw new Error('运算符非法或重复');
  if (!Array.isArray(c.examples) || !c.examples.length || c.examples.length > 64) throw new Error('需要 1…64 条初始样例');
  const examples = c.examples.map(v => {
    const e = record(v); keys(e, ['input', 'output']);
    if (!Array.isArray(e.input) || e.input.length !== variables) throw new Error('样例输入维度错误');
    return { input: e.input.map(v => integer(v, -INPUT_LIMIT, INPUT_LIMIT)), output: integer(e.output, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER) };
  });
  const seen = new Map<string, number>();
  for (const e of examples) {
    const k = JSON.stringify(e.input);
    if (seen.has(k)) throw new Error('样例输入重复（包括冲突输出）');
    seen.set(k, e.output);
  }
  const d = record(c.domain); keys(d, ['min', 'max']);
  const domain = { min: integer(d.min, -INPUT_LIMIT, INPUT_LIMIT), max: integer(d.max, -INPUT_LIMIT, INPUT_LIMIT) };
  if (domain.max < domain.min || (domain.max - domain.min + 1) ** variables > 4096) throw new Error('验证域必须非空且最多 4096 个输入');
  const s = record(c.spec); let spec: Spec;
  if (s.kind === 'builtin') {
    keys(s, ['kind', 'name']);
    if (!NAMES.includes(s.name as Name) || variables !== (s.name === 'Max2' ? 2 : 1)) throw new Error('内置规格名称或输入维度错误');
    spec = { kind: 'builtin', name: s.name as Name };
  } else if (s.kind === 'expression') {
    keys(s, ['kind', 'ast']); const p = parseExpr(s.ast, variables);
    if (p.type !== 'int') throw new Error('规格必须返回整数');
    spec = { kind: 'expression', ast: p.ast };
  } else throw new Error('规格类型错误');
  const b = record(c.budget); keys(b, ['maxNodes', 'maxCandidates', 'maxStored', 'timeMs', 'maxIterations', 'verifyLimit']);
  const budget: Budget = { maxNodes: integer(b.maxNodes, 1, 15), maxCandidates: integer(b.maxCandidates, 1, 5_000_000), maxStored: integer(b.maxStored, 1, 20_000), timeMs: integer(b.timeMs, 1, 30_000), maxIterations: integer(b.maxIterations, 1, 32), verifyLimit: integer(b.verifyLimit, 1, 4096) };
  return { version: 1, variables, constants, operators: OPS.filter(op => (c.operators as Op[]).includes(op)), examples, domain, spec, budget };
}
export function importExperiment(text: string): Config {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error('JSON 超过 2 MiB');
  const raw = record(JSON.parse(text));
  if ('config' in raw) { keys(raw, ['config', 'result', 'format']); if (raw.format !== 'synthlab-v1') throw new Error('实验格式错误'); return parseConfig(raw.config); }
  return parseConfig(raw);
}
export function exportExperiment(config: Config, result: unknown): string {
  return JSON.stringify({ format: 'synthlab-v1', config: parseConfig(config), result }, null, 2);
}
