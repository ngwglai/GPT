import { expect, it } from "vitest";
import { check } from "../src/core/search";
import type { Expr, Model, Step } from "../src/core/types";

// Independent oracle: finite directed integer graph, DFS reachability and
// repeated edge relaxation for distances. Never imports the AST interpreter,
// transition generator, serialization, properties or trace reconstruction.
interface Edge {
  from: number;
  to: number;
  name: string;
}
function reference(size: number, edges: Edge[], initial: number[]) {
  const reached = new Set<number>(),
    stack = [...initial];
  while (stack.length) {
    const n = stack.pop()!;
    if (reached.has(n)) continue;
    reached.add(n);
    for (const edge of edges) if (edge.from === n) stack.push(edge.to);
  }
  const distance = Array<number>(size).fill(Infinity);
  initial.forEach((x) => {
    distance[x] = 0;
  });
  for (let i = 0; i < size; i++)
    for (const edge of edges)
      distance[edge.to] = Math.min(distance[edge.to], distance[edge.from] + 1);
  return { reached, distance };
}
function prng(seed: number) {
  let x = seed;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x;
  };
}
const eq = (name: string, value: number | boolean): Expr => ({
  op: "==",
  args: [{ var: name }, value],
});
const encode = (n: number) => ({ x: Math.floor(n / 2), flag: n % 2 === 1 });
const predicate = (n: number): Expr => ({
  op: "and",
  args: [eq("x", Math.floor(n / 2)), eq("flag", n % 2 === 1)],
});
const any = (values: number[]): Expr =>
  values.length === 0
    ? false
    : values.length === 1
      ? predicate(values[0])
      : { op: "or", args: values.map(predicate) };
const decode = (s: Step) => 2 * (s.state.x as number) + Number(s.state.flag);
function pathIsReal(trace: Step[], edges: Edge[], initial: number[]) {
  expect(initial).toContain(decode(trace[0]));
  expect(trace[0].action).toBeNull();
  for (let i = 1; i < trace.length; i++)
    expect(edges).toContainEqual({
      from: decode(trace[i - 1]),
      to: decode(trace[i]),
      name: trace[i].action,
    });
}
for (const seed of Array.from({ length: 100 }, (_, i) => i + 1)) {
  it(`独立图参考差分 seed=${seed}：状态集、目标、最短失败及路径`, async () => {
    const random = prng(seed),
      size = 4 + 2 * (random() % 6),
      edges: Edge[] = [];
    for (let from = 0; from < size; from++)
      for (let to = 0; to < size; to++)
        if (random() % 7 === 0)
          edges.push({
            from,
            to,
            name: `e${String(edges.length).padStart(3, "0")}`,
          });
    const initial = [random() % size, random() % size];
    const terminal = Array.from({ length: size }, (_, i) => i).filter(
      (n) => !edges.some((e) => e.from === n),
    );
    const oracle = reference(size, edges, initial);
    const m: Model = {
      name: "合成有限图",
      variables: {
        x: { type: "int", min: 0, max: size / 2 - 1 },
        flag: { type: "bool" },
      },
      initial: initial.map(encode),
      actions: edges.map((edge) => ({
        name: edge.name,
        guard: predicate(edge.from),
        set: encode(edge.to),
      })),
      invariants: [],
      terminal: any(terminal),
      goals: Array.from({ length: size }, (_, n) => ({
        name: `g${n}`,
        expr: predicate(n),
      })),
    };
    const run = () =>
      check(JSON.stringify(m), { yieldControl: async () => {} });
    const complete = await run();
    expect(complete.status).toBe("verified");
    expect(
      new Set(
        complete.graph.nodes.map(
          (n) => 2 * (n.state.x as number) + Number(n.state.flag),
        ),
      ),
    ).toEqual(oracle.reached);
    expect(complete.stats.transitions).toBe(
      edges.filter((e) => oracle.reached.has(e.from)).length,
    );
    complete.goals.forEach((g, n) => {
      expect(g.status).toBe(
        oracle.reached.has(n) ? "reachable" : "unreachable",
      );
      if (g.status === "reachable") {
        pathIsReal(g.witness, edges, initial);
        expect(g.witness.length - 1).toBe(oracle.distance[n]);
        expect(decode(g.witness.at(-1)!)).toBe(n);
      }
    });
    const unsafe = Array.from({ length: size }, (_, n) => n).filter(
      () => random() % 3 === 0,
    );
    m.invariants = [
      { name: "避开坏状态", expr: { op: "not", args: [any(unsafe)] } },
    ];
    const violated = await run(),
      shortest = Math.min(...unsafe.map((n) => oracle.distance[n]));
    expect(violated.status).toBe(
      Number.isFinite(shortest) ? "counterexample" : "verified",
    );
    if (violated.status === "counterexample") {
      expect(violated.violation?.kind).toBe("invariant");
      pathIsReal(violated.trace, edges, initial);
      expect(violated.trace.length - 1).toBe(shortest);
      expect(unsafe).toContain(decode(violated.trace.at(-1)!));
    }
    m.invariants = [];
    m.terminal = false;
    const deadlock = await run(),
      deadDistance = Math.min(...terminal.map((n) => oracle.distance[n]));
    expect(deadlock.status).toBe(
      Number.isFinite(deadDistance) ? "counterexample" : "verified",
    );
    if (deadlock.status === "counterexample") {
      expect(deadlock.violation?.kind).toBe("deadlock");
      expect(deadlock.trace.length - 1).toBe(deadDistance);
      pathIsReal(deadlock.trace, edges, initial);
      expect(terminal).toContain(decode(deadlock.trace.at(-1)!));
    }
    const errorSource = random() % size;
    m.terminal = any(terminal.filter((n) => n !== errorSource));
    m.actions.push({
      name: "域外动作",
      guard: predicate(errorSource),
      set: { x: size },
    });
    const error = await run();
    expect(error.status).toBe(
      oracle.reached.has(errorSource) ? "counterexample" : "verified",
    );
    if (error.status === "counterexample") {
      expect(error.violation?.kind).toBe("action_error");
      expect(error.trace.length - 1).toBe(oracle.distance[errorSource]);
      pathIsReal(error.trace, edges, initial);
      expect(decode(error.trace.at(-1)!)).toBe(errorSource);
    }
  });
}
