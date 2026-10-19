import { describe, expect, test } from 'vitest';
import { apply, evaluate, format, parseExpr } from '../src/core/dsl';
import { brute, fromAst, oracle, toAst } from './reference';
const n = (value: number) => ({ op: 'int', value });
const b = (value: boolean) => ({ op: 'bool', value });
const x = { op: 'var', index: 0 };
const binary = (op: string, a: unknown, b: unknown) => ({ op, args: [a, b] });
describe('AST validation', () => {
  for (const bad of [null, [], {}, { op: 'eval', args: [] }, { op: 'int', value: 1.5 }, { op: 'bool', value: 1 }, { op: 'var', index: 1 }, { op: 'int', value: 0, extra: 0 }, binary('add', b(true), n(1)), binary('and', n(1), n(2)), { op: 'sub', args: [n(1)] }, { op: 'not', args: [b(true), b(false)] }, { op: 'if', args: [n(1), n(1), n(2)] }, { op: 'if', args: [b(true), n(1), b(false)] }]) test(`reject ${JSON.stringify(bad)}`, () => expect(() => parseExpr(bad, 1)).toThrow());
  test('bounds AST resource use, including cyclic objects', () => {
    let ast: unknown = n(1); for (let i = 0; i < 70; i++) ast = { op: 'not', args: [ast] };
    expect(() => parseExpr(ast, 1)).toThrow();
    const cycle = { op: 'not', args: [] as unknown[] }; cycle.args.push(cycle); expect(() => parseExpr(cycle, 1)).toThrow();
    expect(() => parseExpr(binary('add', n(1), n(2)), 1, 2)).toThrow();
  });
  for (const env of [[], [1, 2, 3], [NaN], [Infinity], [1.2], [1_000_001], ['1'], null]) test(`reject input ${JSON.stringify(env)}`, () => expect(() => evaluate(x, env)).toThrow());
});
test('overflow, safe boundaries and lazy conditional masking', () => {
  const max = Number.MAX_SAFE_INTEGER;
  expect(evaluate(binary('add', n(max), n(1)), [0])).toBe(null);
  expect(evaluate(binary('sub', n(-max), n(1)), [0])).toBe(null);
  expect(evaluate(binary('add', n(max), n(-1)), [0])).toBe(max - 1);
  const failure = binary('add', n(max), n(1));
  expect(evaluate({ op: 'if', args: [b(false), failure, n(7)] }, [0])).toBe(7);
  expect(evaluate({ op: 'if', args: [b(true), failure, n(7)] }, [0])).toBe(null);
  expect(evaluate(binary('and', b(false), binary('lt', failure, n(0))), [0])).toBe(null); // strict Boolean operators
  expect(apply('if', [null, 1, 2])).toBe(null);
});
test('independent BigInt reference for all small typed trees and overflow contexts', () => {
  const trees = brute(5, [0, Number.MAX_SAFE_INTEGER], ['add', 'sub', 'lt', 'le', 'eq', 'and', 'or', 'not', 'if']);
  let count = 0;
  for (const tree of [...trees.ints.flat(), ...trees.bools.flat()]) for (const input of [-1, 0, 1]) {
    expect(evaluate(toAst(tree), [input])).toBe(oracle(tree, input)); count++;
  }
  expect(count).toBeGreaterThan(1000);
});
test('human expression reflects the actual AST', () => {
  const ast = parseExpr({ op: 'if', args: [binary('lt', x, n(0)), binary('sub', n(0), x), x] }, 1).ast;
  expect(format(ast)).toBe('if (x < 0) then (0 - x) else x');
  expect(evaluate(ast, [-3])).toBe(oracle(fromAst(ast), -3));
});
