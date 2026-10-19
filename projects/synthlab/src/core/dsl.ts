export type Type = 'int' | 'bool';
export type IntExpr = { op: 'int'; value: number } | { op: 'var'; index: number }
  | { op: 'add' | 'sub'; args: [IntExpr, IntExpr] }
  | { op: 'if'; args: [BoolExpr, IntExpr, IntExpr] };
export type BoolExpr = { op: 'bool'; value: boolean }
  | { op: 'lt' | 'le' | 'eq'; args: [IntExpr, IntExpr] }
  | { op: 'and' | 'or'; args: [BoolExpr, BoolExpr] }
  | { op: 'not'; args: [BoolExpr] }
  | { op: 'if'; args: [BoolExpr, BoolExpr, BoolExpr] };
export type Expr = IntExpr | BoolExpr;
export type Value = number | boolean | null; // null is the single semantic error value ⊥.
export const OPS = ['add', 'sub', 'lt', 'le', 'eq', 'and', 'or', 'not', 'if'] as const;
export type Op = typeof OPS[number];
export const INPUT_LIMIT = 1_000_000;
export function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('需要 JSON 对象');
  return v as Record<string, unknown>;
}
export function keys(v: Record<string, unknown>, expected: string[]) {
  if (Object.keys(v).sort().join(',') !== [...expected].sort().join(',')) throw new Error('字段缺失或存在未知字段');
}
export function integer(v: unknown, lo: number, hi: number): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < lo || v > hi) throw new Error(`需要 ${lo}…${hi} 内的安全整数`);
  return Object.is(v, -0) ? 0 : v;
}
export function parseExpr(value: unknown, variables: number, maxSize = 63): { ast: Expr; type: Type; size: number } {
  let count = 0;
  function visit(v: unknown, depth: number): { ast: Expr; type: Type } {
    if (++count > maxSize || depth > 32) throw new Error('AST 大小或深度超限');
    const n = record(v);
    if (n.op === 'int') {
      keys(n, ['op', 'value']);
      return { ast: { op: 'int', value: integer(n.value, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER) }, type: 'int' };
    }
    if (n.op === 'bool') {
      keys(n, ['op', 'value']);
      if (typeof n.value !== 'boolean') throw new Error('布尔常量类型错误');
      return { ast: { op: 'bool', value: n.value }, type: 'bool' };
    }
    if (n.op === 'var') {
      keys(n, ['op', 'index']);
      return { ast: { op: 'var', index: integer(n.index, 0, variables - 1) }, type: 'int' };
    }
    keys(n, ['op', 'args']);
    if (!OPS.includes(n.op as Op) || !Array.isArray(n.args)) throw new Error('未知运算符或运算元格式错误');
    const op = n.op as Op;
    if (n.args.length !== (op === 'if' ? 3 : op === 'not' ? 1 : 2)) throw new Error('运算元数量错误');
    const a = n.args.map(v => visit(v, depth + 1));
    let type: Type;
    if (op === 'if') {
      if (a[0].type !== 'bool' || a[1].type !== a[2].type) throw new Error('条件或分支类型错误');
      type = a[1].type;
    } else {
      const wanted = ['and', 'or', 'not'].includes(op) ? 'bool' : 'int';
      if (a.some(v => v.type !== wanted)) throw new Error('运算元类型错误');
      type = op === 'add' || op === 'sub' ? 'int' : 'bool';
    }
    // All tuple lengths and operand types were checked above.
    return { ast: { op, args: a.map(v => v.ast) } as Expr, type };
  }
  const result = visit(value, 1);
  return { ...result, size: count };
}
export function apply(op: Op, a: Value[]): Value {
  if (op === 'if') return a[0] === null ? null : a[0] ? a[1] : a[2];
  if (a.some(v => v === null)) return null;
  switch (op) {
    case 'add': case 'sub': {
      const n = op === 'add' ? (a[0] as number) + (a[1] as number) : (a[0] as number) - (a[1] as number);
      return Number.isSafeInteger(n) ? (Object.is(n, -0) ? 0 : n) : null;
    }
    case 'lt': return (a[0] as number) < (a[1] as number);
    case 'le': return (a[0] as number) <= (a[1] as number);
    case 'eq': return a[0] === a[1];
    case 'and': return Boolean(a[0] && a[1]);
    case 'or': return Boolean(a[0] || a[1]);
    case 'not': return !a[0];
  }
}
// Only accepts a validated AST and a validated environment. if evaluates only its selected branch.
export function interpret(ast: Expr, input: number[]): Value {
  if (ast.op === 'int' || ast.op === 'bool') return ast.value;
  if (ast.op === 'var') return input[ast.index];
  if (ast.op === 'if') {
    const c = interpret(ast.args[0], input);
    return c === null ? null : interpret(c ? ast.args[1] : ast.args[2], input);
  }
  return apply(ast.op, ast.args.map(a => interpret(a, input)));
}
export function evaluate(value: unknown, input: unknown): Value {
  if (!Array.isArray(input) || input.length < 1 || input.length > 2) throw new Error('输入必须包含 1 或 2 个整数');
  const env = input.map(v => integer(v, -INPUT_LIMIT, INPUT_LIMIT));
  return interpret(parseExpr(value, env.length).ast, env);
}
export function format(ast: Expr): string {
  if (ast.op === 'int' || ast.op === 'bool') return String(ast.value);
  if (ast.op === 'var') return ['x', 'y'][ast.index];
  if (ast.op === 'if') return `if ${format(ast.args[0])} then ${format(ast.args[1])} else ${format(ast.args[2])}`;
  if (ast.op === 'not') return `!(${format(ast.args[0])})`;
  const symbols = { add: '+', sub: '-', lt: '<', le: '≤', eq: '==', and: '&&', or: '||' };
  return `(${format(ast.args[0])} ${symbols[ast.op]} ${format(ast.args[1])})`;
}
