import { expect, it } from "vitest";
import { evaluate } from "../src/core/expression";
import { check } from "../src/core/search";
import type { Expr, Model } from "../src/core/types";
it.each([
  ["+", [2, 3], 5],
  ["-", [2, 3], -1],
  ["*", [-2, 3], -6],
  ["==", ["a", "a"], true],
  ["!=", [true, false], true],
  ["<", [-2, -1], true],
  ["<=", [2, 2], true],
  [">", [3, 2], true],
  [">=", [2, 2], true],
  ["and", [true, false, true], false],
  ["or", [false, false, true], true],
  ["not", [false], true],
] as const)("封闭表达式 %s", (op, args, value) => {
  expect(evaluate({ op, args: [...args] } as Expr, {})).toBe(value);
});
it("引用返回原状态，不修改输入", () => {
  const state = Object.freeze({ x: 3 });
  expect(evaluate({ var: "x" }, state)).toBe(3);
  expect(state.x).toBe(3);
});
it("真实默认50,000状态上限，不将截断当作通过", async () => {
  const m: Model = {
    name: "状态预算",
    variables: { x: { type: "int", min: 0, max: 50_001 } },
    initial: [{ x: 0 }],
    actions: [
      {
        name: "增量",
        guard: true,
        set: { x: { op: "+", args: [{ var: "x" }, 1] } },
      },
    ],
    invariants: [],
    terminal: false,
    goals: [],
  };
  const r = await check(JSON.stringify(m), { yieldControl: async () => {} });
  expect(r.status).toBe("inconclusive");
  expect(r.stats.states).toBe(50_000);
  expect(r.reason).toContain("状态预算");
});
it("真实默认200,000转移上限及图边上限", async () => {
  const m: Model = {
    name: "转移预算",
    variables: { x: { type: "int", min: 0, max: 5000 } },
    initial: [{ x: 0 }],
    actions: [
      {
        name: "递增",
        guard: true,
        set: { x: { op: "+", args: [{ var: "x" }, 1] } },
      },
      ...Array.from({ length: 127 }, (_, i) => ({
        name: `自循环${i}`,
        guard: true,
        set: { x: { var: "x" } },
      })),
    ],
    invariants: [],
    terminal: false,
    goals: [],
  };
  const r = await check(JSON.stringify(m), { yieldControl: async () => {} });
  expect(r.status).toBe("inconclusive");
  expect(r.stats.transitions).toBe(200_000);
  expect(r.reason).toContain("转移预算");
  expect(r.graph.edges).toHaveLength(2000);
  expect(r.graph.truncated).toBe(true);
});
it("目标见证路径超1000步时明确省略，目标仍为真实可达", async () => {
  const m: Model = {
    name: "长目标轨迹",
    variables: { x: { type: "int", min: 0, max: 1100 } },
    initial: [{ x: 0 }],
    actions: [
      {
        name: "增量",
        guard: true,
        set: { x: { op: "+", args: [{ var: "x" }, 1] } },
      },
    ],
    invariants: [],
    terminal: { op: "==", args: [{ var: "x" }, 1100] },
    goals: [{ name: "目标", expr: { op: "==", args: [{ var: "x" }, 1100] } }],
  };
  const r = await check(JSON.stringify(m), { yieldControl: async () => {} });
  expect(r.status).toBe("verified");
  expect(r.goals[0]).toMatchObject({
    status: "reachable",
    witness: [],
    witnessOmitted: true,
  });
});
it("性质求值溢出单独标明 evaluation_error", async () => {
  const m: Model = {
    name: "表达式溢出",
    variables: { x: { type: "bool" } },
    initial: [{ x: false }],
    actions: [],
    invariants: [
      {
        name: "溢出性质",
        expr: {
          op: "==",
          args: [{ op: "*", args: [Number.MAX_SAFE_INTEGER, 2] }, 0],
        },
      },
    ],
    terminal: true,
    goals: [],
  };
  const r = await check(JSON.stringify(m));
  expect(r.status).toBe("counterexample");
  expect(r.violation?.kind).toBe("evaluation_error");
});

it("内部异常不会伪造模型语义反例，向Worker适配层传播", async () => {
  const m: Model = {
    name: "内部故障",
    variables: { x: { type: "int", min: 0, max: 10 } },
    initial: [{ x: 0 }],
    actions: [
      {
        name: "步进",
        guard: true,
        set: { x: { op: "+", args: [{ var: "x" }, 1] } },
      },
    ],
    invariants: [],
    terminal: false,
    goals: [],
  };
  let calls = 0;
  await expect(
    check(JSON.stringify(m), {
      yieldControl: async () => {},
      now: () => {
        if (++calls === 9) throw new Error("内部故障");
        return 0;
      },
    }),
  ).rejects.toThrow("内部故障");
});
