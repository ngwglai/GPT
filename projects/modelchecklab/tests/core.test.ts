import { describe, expect, it } from "vitest";
import { check } from "../src/core/search";
import { parseModel } from "../src/core/validation";
import { applyAction } from "../src/core/transition";
import { stateKey } from "../src/core/state";
import { examples } from "../src/examples";
import type { Expr, Model } from "../src/core/types";

const v = (name = "x"): Expr => ({ var: name });
const op = (name: "==" | "<" | "+" | "-", ...args: Expr[]): Expr => ({
  op: name,
  args,
});
function counter(): Model {
  return {
    name: "计数",
    variables: { x: { type: "int", min: 0, max: 4 } },
    initial: [{ x: 0 }],
    actions: [
      { name: "递增", guard: op("<", v(), 4), set: { x: op("+", v(), 1) } },
    ],
    invariants: [],
    terminal: op("==", v(), 4),
    goals: [{ name: "到达4", expr: op("==", v(), 4) }],
  };
}
const run = (m: Model, options = {}) =>
  check(JSON.stringify(m), { yieldControl: async () => {}, ...options });

describe("状态、搜索与性质", () => {
  it("完整枚举与统计", async () => {
    const r = await run(counter());
    expect(r.status).toBe("verified");
    expect(r.complete).toBe(true);
    expect(r.graph.nodes.map((n) => n.state.x)).toEqual([0, 1, 2, 3, 4]);
    expect(r.stats).toMatchObject({ states: 5, transitions: 4, expanded: 5 });
    expect(r.goals[0].witness.map((s) => s.state.x)).toEqual([0, 1, 2, 3, 4]);
  });
  it("BFS 选择最短反例而非动作深搜顺序", async () => {
    const m = counter();
    m.invariants = [{ name: "小于4", expr: op("<", v(), 4) }];
    m.actions.push({ name: "跳到3", guard: op("==", v(), 0), set: { x: 3 } });
    const r = await run(m);
    expect(r.status).toBe("counterexample");
    expect(r.trace.map((s) => s.state.x)).toEqual([0, 3, 4]);
  });
  it("去重循环、自循环与规范化键", async () => {
    const m = counter();
    m.actions.push({ name: "回到0", guard: true, set: { x: 0 } });
    const r = await run(m);
    expect(r.stats.states).toBe(5);
    expect(r.stats.transitions).toBe(8);
    expect(stateKey({ a: 1, b: true }, ["a", "b"])).toBe(
      stateKey({ b: true, a: 1 }, ["a", "b"]),
    );
  });
  it("多初态和重复初态，初态反例长度为0条边", async () => {
    const m = counter();
    m.initial = [{ x: 0 }, { x: 3 }, { x: 0 }];
    m.invariants = [{ name: "小于3", expr: op("<", v(), 3) }];
    const r = await run(m);
    expect(r.trace).toEqual([{ state: { x: 3 }, action: null }]);
  });
  it("原子更新全部读取旧状态，交换变量", () => {
    const m = examples[4].model;
    expect(
      applyAction(
        {
          name: "交换",
          guard: true,
          set: { a: { var: "b" }, b: { var: "a" } },
        },
        { a: 2, b: 1 },
        m,
      ),
    ).toEqual({ a: 1, b: 2 });
  });
  it("无后继的正常终止与死锁分别报告", async () => {
    const m = counter();
    m.actions = [];
    expect((await run(m)).violation?.kind).toBe("deadlock");
    m.terminal = true;
    expect((await run(m)).status).toBe("verified");
  });
  it("终止状态不扩展，但仍检查不变量和目标", async () => {
    const m = counter();
    m.terminal = true;
    m.invariants = [{ name: "不允许0", expr: false }];
    expect((await run(m)).violation?.kind).toBe("invariant");
    m.invariants = [];
    const r = await run(m);
    expect(r.stats.transitions).toBe(0);
    expect(r.goals[0].status).toBe("unreachable");
  });
  it("安全结果与可达性独立，不可达仅在完成时确定", async () => {
    const m = counter();
    m.goals.push({ name: "域外目标", expr: op("==", v(), 9) });
    const r = await run(m);
    expect(r.goals.map((g) => g.status)).toEqual(["reachable", "unreachable"]);
    m.invariants = [{ name: "早停", expr: false }];
    expect((await run(m)).goals.map((g) => g.status)).toEqual([
      "unknown",
      "unknown",
    ]);
  });
  it("已到达目标保留 reachable，后续取消不改为 unknown", async () => {
    const m = counter();
    m.goals[0].expr = op("==", v(), 0);
    const r = await run(m, { limits: { states: 2 } });
    expect(r.status).toBe("inconclusive");
    expect(r.goals[0].status).toBe("reachable");
  });
  it("越界动作是明确语义错误，不是死锁、终止或非法初态", async () => {
    const m = counter();
    m.actions[0].set.x = 5;
    const r = await run(m);
    expect(r.violation?.kind).toBe("action_error");
    expect(r.trace).toHaveLength(1);
    expect(r.violation?.action).toBe("递增");
    m.initial[0].x = 5;
    expect((await run(m)).status).toBe("invalid_model");
  });
  it("安全整数溢出是语义错误", async () => {
    const m = counter();
    m.actions[0].set.x = op("+", Number.MAX_SAFE_INTEGER, 1);
    expect((await run(m)).violation?.kind).toBe("action_error");
  });
  it("禁用的域外赋值不执行", async () => {
    const m = counter();
    m.actions.push({ name: "不可执行", guard: false, set: { x: 100 } });
    expect((await run(m)).status).toBe("verified");
  });
  it("遍历顺序确定，不受动作列表及赋值键顺序影响", async () => {
    const m = examples[1].model,
      a = await run(m),
      b = await run({ ...m, actions: [...m.actions].reverse() });
    expect(a.trace).toEqual(b.trace);
    expect(a.graph).toEqual(b.graph);
  });
});

describe("预算和取消", () => {
  it.each([
    { states: 0 },
    { states: 4 },
    { transitions: 0 },
    { transitions: 3 },
    { timeMs: 0 },
  ])("预算 %j 不能报告通过", async (limits) => {
    const r = await run(counter(), { limits });
    expect(r.status).toBe("inconclusive");
    expect(r.complete).toBe(false);
    expect(r.goals[0].status).toBe("unknown");
  });
  it("预算恰好足够时允许完成", async () => {
    expect(
      (await run(counter(), { limits: { states: 5, transitions: 4 } })).status,
    ).toBe("verified");
  });
  it("执行前取消", async () => {
    expect((await run(counter(), { cancelled: () => true })).reason).toContain(
      "取消",
    );
  });
  it("执行中取消，保留部分统计", async () => {
    const m = counter();
    m.variables.x = { type: "int", min: 0, max: 1000 };
    m.actions[0].guard = true;
    m.terminal = false;
    let yields = 0;
    const r = await run(m, {
      cancelled: () => yields >= 2,
      yieldControl: async () => {
        yields++;
      },
    });
    expect(r.status).toBe("inconclusive");
    expect(r.stats.states).toBe(65);
    expect(r.stats.expanded).toBe(64);
  });
  it("注入时钟触发运行中超时", async () => {
    let t = 0;
    const r = await run(counter(), { now: () => t++, limits: { timeMs: 5 } });
    expect(r.status).toBe("inconclusive");
    expect(r.reason).toContain("时间");
  });
  it("大于硬上限、NaN 和负预算都不放行", async () => {
    for (const states of [50_001, -1, NaN])
      expect((await run(counter(), { limits: { states } })).status).toBe(
        "inconclusive",
      );
  });
  it("图只保留500节点和2000边", async () => {
    const m = counter();
    m.variables.x = { type: "int", min: 0, max: 600 };
    m.actions[0].guard = op("<", v(), 600);
    m.terminal = op("==", v(), 600);
    const r = await run(m);
    expect(r.status).toBe("verified");
    expect(r.stats.states).toBe(601);
    expect(r.graph.nodes).toHaveLength(500);
    expect(r.graph.truncated).toBe(true);
  });
});

describe("严格输入校验", () => {
  it.each(["{", "null", "[]", '{"name":"脚本"}'])(
    "非法JSON/模型 %s",
    async (text) => {
      expect((await check(text)).status).toBe("invalid_model");
    },
  );
  it.each([
    { op: "eval", args: ["alert(1)"] },
    { var: "missing" },
    { op: "+", args: [true, 1] },
    { op: "==", args: [1, "1"] },
    { op: "not", args: [1] },
    { op: "<", args: [1] },
    { var: "x", source: "代码" },
    null,
  ])("非法表达式 %j", async (expr) => {
    const m = counter();
    (m.actions[0] as unknown as Record<string, unknown>).guard = expr;
    expect((await run(m)).status).toBe("invalid_model");
  });
  it("拒绝空初态、缺失变量、重复名称、空赋值、错误域和额外字段", async () => {
    const mutations: ((m: Model) => void)[] = [
      (m) => {
        m.initial = [];
      },
      (m) => {
        m.initial = [{}];
      },
      (m) => {
        m.actions.push(m.actions[0]);
      },
      (m) => {
        m.actions[0].set = {};
      },
      (m) => {
        m.variables.x = { type: "int", min: 2, max: 1 };
      },
      (m) => {
        (m as unknown as Record<string, unknown>).code = "x";
      },
      (m) => {
        m.variables.x = { type: "enum", values: ["a", "a"] };
      },
    ];
    for (const change of mutations) {
      const m = counter();
      change(m);
      expect((await run(m)).status).toBe("invalid_model");
    }
  });
  it("拒绝原型相关键及赋值到未知变量", async () => {
    const m = counter();
    Object.defineProperty(m.variables, "constructor", {
      value: { type: "bool" },
      enumerable: true,
    });
    expect((await run(m)).status).toBe("invalid_model");
    const n = counter();
    n.actions[0].set.missing = 0;
    expect((await run(n)).status).toBe("invalid_model");
  });
  it("输入与结构资源上限返回 inconclusive", async () => {
    expect((await check(" ".repeat(65_537))).status).toBe("inconclusive");
    const m = counter();
    for (let i = 0; i < 13; i++) m.variables[`v${i}`] = { type: "bool" };
    expect((await run(m)).status).toBe("inconclusive");
    let expr: Expr = true;
    for (let i = 0; i < 26; i++) expr = { op: "not", args: [expr] };
    m.variables = counter().variables;
    m.terminal = expr;
    expect((await run(m)).status).toBe("inconclusive");
  });
  it("枚举域外的运行结果产生 action_error", async () => {
    const m = structuredClone(examples[0].model);
    m.actions[0].set.p = "outside";
    expect((await run(m)).violation?.kind).toBe("action_error");
  });
  it("模型可无损JSON往返", () => {
    for (const x of examples)
      expect(parseModel(JSON.stringify(x.model))).toEqual(x.model);
  });
});

describe("四组案例全部经过同一内核", () => {
  it.each(examples)("$id", async (example) => {
    const r = await run(example.model);
    expect(r.status).toBe(example.good ? "verified" : "counterexample");
    if (example.good) expect(r.goals[0].status).toBe("reachable");
    else
      expect(r.violation?.kind).toBe(
        example.id === "locks-bad" ? "deadlock" : "invariant",
      );
    const renamed = { ...example.model, name: "任意名称" };
    expect((await run(renamed)).status).toBe(r.status);
  });
});
