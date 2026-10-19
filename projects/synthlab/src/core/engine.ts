import { apply, format, interpret } from './dsl';
import type { Expr, Op, Type, Value } from './dsl';
import { parseConfig } from './config';
import type { Config, Example } from './config';
import { domainInputs, reference } from './spec';
export type Status = 'verified' | 'no-solution' | 'budget-exhausted' | 'cancelled' | 'invalid-input' | 'internal-error' | 'worker-error';
export interface Stats { generated: number; structural: number; semantic: number; retained: number; errorValues: number; depth: number; completedSize: number; elapsedMs: number }
export interface Verification { status: 'incomplete' | 'counterexample' | 'passed'; domain: Config['domain']; total: number; checked: number; complete: boolean; counterexample?: Example; actual?: Value }
export interface Iteration { round: number; examples: Example[]; ast: Expr; expression: string; size: number; minimal: boolean; verification: Verification }
export interface Trace { event: string; round: number; depth: number; generated: number; expression?: string }
export interface Snapshot { stats: Stats; iterations: Iteration[]; trace: Trace[]; traceDropped: number; candidate?: Expr; verification?: Verification }
export interface Result extends Snapshot { status: Status; message: string }
export interface Control { cancelled?: () => boolean; now?: () => number; yield?: () => Promise<void>; progress?: (snapshot: Snapshot) => void; pruning?: boolean }
interface Entry { ast: Expr; type: Type; size: number; values: Value[]; id: number }
interface Proposal { op?: Op; children: Entry[]; ast?: Expr; type: Type; size: number }
const commutative = new Set<Op>(['add', 'eq', 'and', 'or']);
const signatures: Record<Op, { result: Type; args: Type[] }[]> = {
  add: [{ result: 'int', args: ['int', 'int'] }], sub: [{ result: 'int', args: ['int', 'int'] }],
  lt: [{ result: 'bool', args: ['int', 'int'] }], le: [{ result: 'bool', args: ['int', 'int'] }], eq: [{ result: 'bool', args: ['int', 'int'] }],
  and: [{ result: 'bool', args: ['bool', 'bool'] }], or: [{ result: 'bool', args: ['bool', 'bool'] }], not: [{ result: 'bool', args: ['bool'] }],
  if: [{ result: 'int', args: ['bool', 'int', 'int'] }, { result: 'bool', args: ['bool', 'bool', 'bool'] }],
};
function* partitions(total: number, count: number): Generator<number[]> {
  if (count === 1) { if (total >= 1) yield [total]; return; }
  for (let i = 1; i <= total - count + 1; i++) for (const tail of partitions(total - i, count - 1)) yield [i, ...tail];
}
function* product(lists: Entry[][], prefix: Entry[] = []): Generator<Entry[]> {
  if (prefix.length === lists.length) { yield prefix; return; }
  for (const e of lists[prefix.length]) yield* product(lists, [...prefix, e]);
}
function* proposals(c: Config, size: number, buckets: Record<Type, Entry[][]>): Generator<Proposal> {
  if (size === 1) {
    for (let index = 0; index < c.variables; index++) yield { ast: { op: 'var', index }, type: 'int', size, children: [] };
    for (const value of c.constants) yield { ast: { op: 'int', value }, type: 'int', size, children: [] };
    for (const value of [false, true]) yield { ast: { op: 'bool', value }, type: 'bool', size, children: [] };
    return;
  }
  for (const op of c.operators) for (const sig of signatures[op]) for (const parts of partitions(size - 1, sig.args.length)) {
    const lists = sig.args.map((type, i) => buckets[type][parts[i]]);
    for (const children of product(lists)) yield { op, children, type: sig.result, size };
  }
}
class Halt extends Error { constructor(public status: 'budget-exhausted' | 'cancelled', message: string) { super(message); } }
export function emptySnapshot(): Snapshot {
  return { stats: { generated: 0, structural: 0, semantic: 0, retained: 0, errorValues: 0, depth: 0, completedSize: 0, elapsedMs: 0 }, iterations: [], trace: [], traceDropped: 0 };
}
export async function runExperiment(raw: unknown, control: Control = {}): Promise<Result> {
  const now = control.now ?? (() => performance.now());
  const start = now(); const snapshot = emptySnapshot();
  const stats = snapshot.stats;
  const finish = (status: Status, message: string): Result => { stats.elapsedMs = now() - start; return { ...snapshot, status, message }; };
  let c: Config;
  try { c = parseConfig(raw); } catch (e) { return finish('invalid-input', e instanceof Error ? e.message : '配置非法'); }
  function check() {
    if (control.cancelled?.()) throw new Halt('cancelled', '已取消；验证结论未完成');
    if (now() - start >= c.budget.timeMs) throw new Halt('budget-exhausted', '达到总时间预算；不能判断有界范围内是否无解');
  }
  function event(event: string, round: number, expression?: string) {
    if (snapshot.trace.length === 128) { snapshot.trace.shift(); snapshot.traceDropped++; }
    snapshot.trace.push({ event, round, depth: stats.depth, generated: stats.generated, ...(expression ? { expression } : {}) });
  }
  async function pulse() {
    check(); stats.elapsedMs = now() - start;
    // Clone before handing to callers; retained progress must never mutate later.
    control.progress?.(structuredClone(snapshot));
    await (control.yield?.() ?? new Promise<void>(resolve => setTimeout(resolve, 0)));
    check();
  }
  try {
    const examples = structuredClone(c.examples);
    // A specification is independent of candidate synthesis and must be total on the declared domain.
    // Count verification separately; this preflight is not a candidate verification pass.
    for (const input of domainInputs(c)) {
      check();
      if (reference(c.spec, input) === null) return finish('invalid-input', '目标规格在验证域内溢出，必须为全函数');
    }
    for (const e of examples) if (reference(c.spec, e.input) !== e.output) return finish('invalid-input', '初始样例与目标规格冲突');
    for (let round = 1; round <= c.budget.maxIterations; round++) {
      check(); stats.completedSize = 0; stats.depth = 0;
      snapshot.candidate = undefined; snapshot.verification = undefined;
      event('重新枚举', round); await pulse();
      const buckets: Record<Type, Entry[][]> = { int: Array.from({ length: c.budget.maxNodes + 1 }, () => []), bool: Array.from({ length: c.budget.maxNodes + 1 }, () => []) };
      const seen = new Set<string>(); let stored = 0; let found: Entry | undefined;
      search: for (let size = 1; size <= c.budget.maxNodes; size++) {
        stats.depth = size;
        for (const p of proposals(c, size, buckets)) {
          check();
          if (stats.generated >= c.budget.maxCandidates) throw new Halt('budget-exhausted', '达到总候选预算；搜索尚未完整枚举');
          stats.generated++;
          if (stats.generated % 2048 === 0) await pulse();
          if (p.op && commutative.has(p.op) && p.children[0].id > p.children[1].id) { stats.structural++; continue; }
          const values = examples.map((e, i) => p.ast ? interpret(p.ast, e.input) : apply(p.op!, p.children.map(ch => ch.values[i])));
          stats.errorValues += values.filter(v => v === null).length;
          const signature = `${p.type}:${JSON.stringify(values)}`;
          if (control.pruning !== false && seen.has(signature)) { stats.semantic++; continue; }
          const ast = p.ast ?? { op: p.op!, args: p.children.map(ch => ch.ast) } as Expr;
          // A full error vector is retained too: errors may be masked in a conditional context.
          const entry: Entry = { ast, values, size, type: p.type, id: stats.generated };
          if (entry.type === 'int' && values.every((v, i) => v === examples[i].output)) { found = entry; break search; }
          if (stored >= c.budget.maxStored) throw new Halt('budget-exhausted', '达到每轮代表数量预算；搜索尚未完整枚举');
          stored++; stats.retained++; seen.add(signature); buckets[p.type][size].push(entry);
        }
        stats.completedSize = size; event('完成节点层', round); await pulse();
      }
      if (!found) return finish('no-solution', '已完整枚举当前 DSL 与 AST 上限的等价类，无程序满足当前样例');
      snapshot.candidate = found.ast;
      event('发现候选', round, format(found.ast));
      const verification: Verification = { status: 'incomplete', domain: { ...c.domain }, total: (c.domain.max - c.domain.min + 1) ** c.variables, checked: 0, complete: false };
      snapshot.verification = verification;
      const iteration: Iteration = { round, examples: structuredClone(examples), ast: found.ast, expression: format(found.ast), size: found.size, minimal: stats.completedSize === found.size - 1, verification };
      snapshot.iterations.push(iteration); await pulse();
      for (const input of domainInputs(c)) {
        check();
        if (verification.checked >= c.budget.verifyLimit) throw new Halt('budget-exhausted', '达到每轮验证数量预算；验证未完成');
        const expected = reference(c.spec, input)!;
        const actual = interpret(found.ast, input); verification.checked++;
        if (actual !== expected) { verification.status = 'counterexample'; verification.counterexample = { input, output: expected }; verification.actual = actual; break; }
        if (verification.checked % 128 === 0) await pulse();
      }
      if (!verification.counterexample) {
        check(); verification.complete = verification.checked === verification.total;
        if (!verification.complete) throw new Error('验证计数不一致');
        verification.status = 'passed';
        event('有限域验证通过', round); return finish('verified', '仅在指定有限输入域内验证通过，不是无限域证明');
      }
      event('真实反例', round, JSON.stringify(verification.counterexample));
      examples.push(verification.counterexample); await pulse();
    }
    return finish('budget-exhausted', '达到 CEGIS 迭代预算；尚未验证通过');
  } catch (e) {
    if (e instanceof Halt) return finish(e.status, e.message);
    return finish('internal-error', '内部异常；本次结果不构成验证结论');
  }
}
