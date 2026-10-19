import { expect, test } from 'vitest';
import { runExperiment } from '../src/core/engine';
import type { Control, Snapshot } from '../src/core/engine';
import { preset } from '../src/core/cases';
import type { Config } from '../src/core/config';
import { parseExpr } from '../src/core/dsl';
import { brute, fromAst, oracle, toAst } from './reference';
const immediate: Control = { yield: async () => {} };
function tiny(): Config {
  const c = preset('Abs'); c.constants = [0, 1]; c.operators = ['sub', 'lt', 'if']; c.domain = { min: -1, max: 1 }; c.budget.maxNodes = 6; return c;
}
function withTarget(c: Config, tree: unknown): Config {
  const ast = parseExpr(tree, 1).ast; c.spec = { kind: 'expression', ast };
  c.examples = [-1, 0, 1].map(x => ({ input: [x], output: oracle(fromAst(ast), x) as number })); return c;
}
test('exhaustive independent grammar oracle: every total observation class through 6 nodes has its minimum representative', async () => {
  const trees = brute(6, [0, 1], ['sub', 'lt', 'if']);
  const signatures = new Map<string, { tree: unknown; size: number }>();
  for (let size = 1; size <= 6; size++) for (const t of trees.ints[size]) {
    const values = [-1, 0, 1].map(x => oracle(t, x));
    if (values.includes(null)) continue;
    const sig = JSON.stringify(values); if (!signatures.has(sig)) signatures.set(sig, { tree: toAst(t), size });
  }
  expect(signatures.size).toBeGreaterThan(10);
  for (const { tree, size } of signatures.values()) {
    const r = await runExperiment(withTarget(tiny(), tree), immediate);
    expect(r.status).toBe('verified'); expect(r.iterations[0].size).toBe(size); expect(r.iterations[0].minimal).toBe(true);
    if (size > 1) { const c = withTarget(tiny(), tree); c.budget.maxNodes = size - 1; expect((await runExperiment(c, immediate)).status).toBe('no-solution'); }
  }
});
test('pruned and unpruned enumerations agree on satisfiability and minimum size', async () => {
  const trees = brute(5, [0, 1], ['sub', 'lt', 'if']);
  const targets = new Map(trees.ints.flat().map(t => [JSON.stringify([-1, 0, 1].map(x => oracle(t, x))), toAst(t)]));
  for (const tree of targets.values()) {
    const c = withTarget(tiny(), tree); c.budget.maxNodes = 5;
    const a = await runExperiment(c, immediate), b = await runExperiment(c, { ...immediate, pruning: false });
    expect(a.status).toBe(b.status); expect(a.iterations[0]?.size).toBe(b.iterations[0]?.size);
  }
});
test('50 fixed seeded random specifications match independent oracle on every domain input', async () => {
  let seed = 0x51a7;
  function next(n: number) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; }
  const grammar = brute(6, [0, 1], ['sub', 'lt', 'if']).ints.flat();
  for (let i = 0; i < 50; i++) {
    const t = grammar[next(grammar.length)], c = tiny(); c.spec = { kind: 'expression', ast: parseExpr(toAst(t), 1).ast }; c.examples = [{ input: [1], output: oracle(t, 1) as number }];
    const r = await runExperiment(c, immediate); expect(r.status).toBe('verified');
    for (const x of [-1, 0, 1]) expect(oracle(fromAst(r.candidate), x)).toBe(oracle(t, x));
  }
});
test('partial overflowing expressions survive pruning when if masks their errors', async () => {
  const c = tiny(); c.constants = [0, Number.MAX_SAFE_INTEGER]; c.operators = ['add', 'lt', 'if']; c.budget.maxNodes = 8;
  const ast = { op: 'if', args: [{ op: 'lt', args: [{ op: 'var', index: 0 }, { op: 'int', value: 0 }] }, { op: 'add', args: [{ op: 'int', value: Number.MAX_SAFE_INTEGER }, { op: 'var', index: 0 }] }, { op: 'int', value: 0 }] };
  const r = await runExperiment(withTarget(c, ast), immediate);
  expect(r.status).toBe('verified'); expect(r.stats.errorValues).toBeGreaterThan(0);
  expect(r.iterations[0].size).toBe(8);
});
test('enumeration is deterministic, and every CEGIS counterexample violates its actual candidate', async () => {
  const c = preset('Sign'); const a = await runExperiment(c, immediate), b = await runExperiment(c, immediate);
  expect(a.iterations).toEqual(b.iterations); expect(a.trace).toEqual(b.trace);
  expect(a.stats.generated).toBe(b.stats.generated); expect(a.stats.semantic).toBeGreaterThan(0);
  for (let i = 0; i < a.iterations.length; i++) {
    const it = a.iterations[i]; const ce = it.verification.counterexample;
    expect(it.verification.checked).toBeGreaterThan(0);
    for (const e of it.examples) expect(oracle(fromAst(it.ast), e.input[0])).toBe(e.output);
    if (ce) {
      expect(ce.output).toBe(ce.input[0] < 0 ? -1 : ce.input[0] > 0 ? 1 : 0);
      expect(oracle(fromAst(it.ast), ce.input[0])).not.toBe(ce.output);
      expect(a.iterations[i + 1].examples).toContainEqual(ce);
    }
  }
  expect(a.trace.filter(t => t.event === '重新枚举').length).toBe(a.iterations.length);
});
test('complete enumeration is required for bounded no-solution', async () => {
  const c = preset('Abs'); c.operators = []; c.budget.maxNodes = 8;
  const r = await runExperiment(c, immediate);
  expect(r.status).toBe('no-solution'); expect(r.stats.completedSize).toBe(8);
  expect(r.verification?.complete).not.toBe(true);
});
for (const [field, value] of [['maxCandidates', 1], ['maxStored', 1], ['timeMs', 1], ['maxIterations', 1], ['verifyLimit', 1]] as const) test(`resource exhaustion: ${field}`, async () => {
  const c = preset('Sign'); c.budget[field] = value;
  let tick = 0;
  const r = await runExperiment(c, { ...immediate, ...(field === 'timeMs' ? { now: () => tick++ } : {}) });
  expect(r.status).toBe('budget-exhausted'); expect(r.verification?.complete).not.toBe(true);
  if (field === 'verifyLimit') expect(r.verification?.checked).toBe(1);
});
test('cooperative cancellation and progress snapshots remain distinct and immutable', async () => {
  const snapshots: Snapshot[] = []; let cancel = false;
  const r = await runExperiment(preset('Abs'), { cancelled: () => cancel, yield: async () => { if (snapshots.length >= 2) cancel = true; }, progress: s => snapshots.push(s) });
  expect(r.status).toBe('cancelled'); expect(snapshots[0].stats.generated).toBe(0); expect(r.stats.generated).toBeGreaterThan(0);
  expect(r.verification?.complete).not.toBe(true);
});
test('internal scheduler exceptions are not mislabeled as a counterexample or no-solution', async () => {
  const r = await runExperiment(preset('Abs'), { yield: async () => { throw Error('unexpected'); } });
  expect(r.status).toBe('internal-error');
});
test('specification must be total and initial examples must match it', async () => {
  const c = preset('Abs'); c.examples[0].output = 2;
  expect((await runExperiment(c)).status).toBe('invalid-input');
  c.spec = { kind: 'expression', ast: { op: 'add', args: [{ op: 'int', value: Number.MAX_SAFE_INTEGER }, { op: 'var', index: 0 }] } };
  expect((await runExperiment(c)).status).toBe('invalid-input');
  expect((await runExperiment({})).status).toBe('invalid-input');
});
test('finite domain is complete with exactly one check per tuple and no infinite-domain claim', async () => {
  const r = await runExperiment(preset('Max2'), immediate);
  expect(r.verification).toMatchObject({ total: 49, checked: 49, complete: true, domain: { min: -3, max: 3 } });
  expect(r.message).toContain('不是无限域证明');
});

test('commutative structure normalization is safe and counted', async () => {
  const c = tiny(); c.operators = ['add']; c.budget.maxNodes = 3;
  withTarget(c, { op: 'add', args: [{ op: 'var', index: 0 }, { op: 'int', value: 4 }] });
  const r = await runExperiment(c, immediate);
  expect(r.status).toBe('no-solution'); expect(r.stats.structural).toBeGreaterThan(0); expect(r.stats.completedSize).toBe(3);
});

test('verification failures have their own explicit iteration status', async () => {
  const r = await runExperiment(preset('Abs'), immediate);
  expect(r.iterations[0].verification.status).toBe('counterexample');
  expect(r.iterations.at(-1)?.verification.status).toBe('passed');
  const c = preset('Abs'); c.budget.verifyLimit = 1;
  expect((await runExperiment(c, immediate)).verification?.status).toBe('incomplete');
});
