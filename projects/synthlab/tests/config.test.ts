import { expect, test } from 'vitest';
import { exportExperiment, importExperiment, parseConfig } from '../src/core/config';
import { preset } from '../src/core/cases';
function bad(change: (c: Record<string, unknown>) => void) { const c = structuredClone(preset('Abs')) as unknown as Record<string, unknown>; change(c); return c; }
const invalid: [string, (c: Record<string, unknown>) => void][] = [
  ['version', c => { c.version = 2; }], ['extra field', c => { c.unknown = 1; }],
  ['variables', c => { c.variables = 3; }], ['no constants', c => { c.constants = []; }],
  ['unsafe constant', c => { c.constants = [Number.MAX_SAFE_INTEGER + 1]; }], ['duplicate constants', c => { c.constants = [0, 0]; }],
  ['too many constants', c => { c.constants = Array.from({ length: 9 }, (_, i) => i); }],
  ['unknown operator', c => { c.operators = ['multiply']; }], ['duplicate operator', c => { c.operators = ['if', 'if']; }],
  ['no examples', c => { c.examples = []; }], ['too many examples', c => { c.examples = Array.from({ length: 65 }, (_, i) => ({ input: [i], output: i })); }],
  ['wrong arity', c => { c.examples = [{ input: [1, 2], output: 1 }]; }], ['invalid output', c => { c.examples = [{ input: [1], output: true }]; }],
  ['out of range input', c => { c.examples = [{ input: [1000001], output: 1 }]; }],
  ['duplicate example', c => { c.examples = [{ input: [1], output: 1 }, { input: [1], output: 1 }]; }],
  ['conflicting example', c => { c.examples = [{ input: [1], output: 1 }, { input: [1], output: 2 }]; }],
  ['empty domain', c => { c.domain = { min: 2, max: 1 }; }], ['huge domain', c => { c.domain = { min: 0, max: 4096 }; }],
  ['domain extra field', c => { c.domain = { min: 0, max: 1, step: 1 }; }],
  ['spec type', c => { c.spec = { kind: 'javascript', code: 'return 1' }; }],
  ['unknown builtin', c => { c.spec = { kind: 'builtin', name: 'Unknown' }; }],
  ['wrong builtin arity', c => { c.spec = { kind: 'builtin', name: 'Max2' }; }],
  ['bool spec', c => { c.spec = { kind: 'expression', ast: { op: 'bool', value: true } }; }],
];
for (const [name, change] of invalid) test(`config rejects ${name}`, () => expect(() => parseConfig(bad(change))).toThrow());
for (const field of ['maxNodes', 'maxCandidates', 'maxStored', 'timeMs', 'maxIterations', 'verifyLimit']) for (const value of [0, 0.5, Infinity, 100000000]) test(`budget ${field} rejects ${value}`, () => {
  const c = preset('Abs'); (c.budget as unknown as Record<string, number>)[field] = value;
  expect(() => parseConfig(c)).toThrow();
});
test('JSON import/export roundtrip validates config but never trusts a stored result', () => {
  const c = preset('Clamp'); const serialized = exportExperiment(c, { status: 'verified', candidate: 'untrusted' });
  expect(importExperiment(serialized)).toEqual(parseConfig(c));
  expect('result' in importExperiment(serialized)).toBe(false);
  expect(importExperiment(JSON.stringify(c))).toEqual(parseConfig(c));
});
test('import enforces UTF-8 byte size, JSON, format and fields', () => {
  for (const text of ['{', '{}', 'null', '[]', '中'.repeat(800000), JSON.stringify({ format: 'other', config: preset('Abs'), result: null }), JSON.stringify({ format: 'synthlab-v1', config: preset('Abs'), result: null, extra: true })]) expect(() => importExperiment(text)).toThrow();
});
test('operator order is normalized and negative zero canonicalized', () => {
  const c = preset('Abs'); c.operators = ['if', 'lt', 'sub']; c.constants = [-0, 1];
  const p = parseConfig(c); expect(p.operators).toEqual(['sub', 'lt', 'if']); expect(Object.is(p.constants[0], -0)).toBe(false);
});

test('large bounded experiment histories can be reimported without trusting them', () => {
  const c = preset('Sign');
  const samples = Array.from({ length: 95 }, (_, i) => ({ input: [i], output: Number.MAX_SAFE_INTEGER }));
  const text = exportExperiment(c, { iterations: Array.from({ length: 32 }, () => ({ examples: samples, verification: { complete: true } })) });
  expect(new TextEncoder().encode(text).length).toBeGreaterThan(131072);
  expect(importExperiment(text)).toEqual(parseConfig(c));
});
