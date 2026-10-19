// Independent oracle: no engine, DSL interpreter, vector application or reference function imports.
export type R = { tag: 'n'; value: number } | { tag: 'b'; value: boolean } | { tag: 'x' } | { tag: string; children: R[] };
export type RV = number | boolean | null;
export function oracle(n: R, x: number): RV {
  if ('value' in n) return n.value;
  if (!('children' in n)) return x;
  if (n.tag === 'if') {
    const cond = oracle(n.children[0], x);
    return cond === null ? null : oracle(n.children[cond ? 1 : 2], x);
  }
  const a = n.children.map(c => oracle(c, x));
  if (a.includes(null)) return null;
  if (n.tag === 'sub' || n.tag === 'add') {
    const value = n.tag === 'sub' ? BigInt(a[0] as number) - BigInt(a[1] as number) : BigInt(a[0] as number) + BigInt(a[1] as number);
    return value > 9007199254740991n || value < -9007199254740991n ? null : Number(value);
  }
  if (n.tag === 'lt') return (a[0] as number) < (a[1] as number);
  if (n.tag === 'le') return (a[0] as number) <= (a[1] as number);
  if (n.tag === 'eq') return a[0] === a[1];
  if (n.tag === 'not') return !a[0];
  if (n.tag === 'and') return a[0] === true && a[1] === true;
  if (n.tag === 'or') return a[0] === true || a[1] === true;
  throw Error('unknown reference operator');
}
export function toAst(n: R): unknown {
  if (n.tag === 'n' && 'value' in n) return { op: 'int', value: n.value };
  if (n.tag === 'b' && 'value' in n) return { op: 'bool', value: n.value };
  if (n.tag === 'x') return { op: 'var', index: 0 };
  if ('children' in n) return { op: n.tag, args: n.children.map(toAst) };
  throw Error('bad reference AST');
}
export function brute(max: number, constants: number[], operators: string[]) {
  const ints: R[][] = Array.from({ length: max + 1 }, () => []);
  const bools: R[][] = Array.from({ length: max + 1 }, () => []);
  ints[1] = [{ tag: 'x' }, ...constants.map(value => ({ tag: 'n' as const, value }))];
  bools[1] = [{ tag: 'b', value: false }, { tag: 'b', value: true }];
  for (let size = 2; size <= max; size++) {
    for (const tag of operators) {
      if (tag === 'not') { for (const a of bools[size - 1]) bools[size].push({ tag, children: [a] }); continue; }
      if (tag === 'if') {
        for (let a = 1; a < size; a++) for (let b = 1; b < size - a; b++) {
          const d = size - a - b - 1; if (d < 1) continue;
          for (const cond of bools[a]) for (const pool of [ints, bools]) for (const yes of pool[b]) for (const no of pool[d]) pool[size].push({ tag, children: [cond, yes, no] });
        }
      } else for (let a = 1; a < size - 1; a++) {
        const b = size - a - 1;
        const source = tag === 'and' || tag === 'or' ? bools : ints;
        const target = tag === 'sub' || tag === 'add' ? ints : bools;
        for (const left of source[a]) for (const right of source[b]) target[size].push({ tag, children: [left, right] });
      }
    }
  }
  return { ints, bools };
}
export function fromAst(v: unknown): R {
  const n = v as { op: string; value: number | boolean; args: unknown[] };
  if (n.op === 'int') return { tag: 'n', value: n.value as number };
  if (n.op === 'bool') return { tag: 'b', value: n.value as boolean };
  if (n.op === 'var') return { tag: 'x' };
  return { tag: n.op, children: n.args.map(fromAst) };
}
