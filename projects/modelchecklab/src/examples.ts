import type { Action, Expr, Model } from "./core/types";
const v = (name: string): Expr => ({ var: name });
const e = (
  op: "==" | "!=" | "+" | "-" | "<" | ">" | "and" | "or" | "not",
  ...args: Expr[]
): Expr => ({ op, args });
const action = (
  name: string,
  guard: Expr,
  set: Record<string, Expr>,
): Action => ({ name, guard, set });
const eq = (name: string, value: Expr) => e("==", v(name), value);
function mutex(bad: boolean): Model {
  return {
    name: `双进程互斥 · ${bad ? "错误：忽略锁" : "正确：原子获取锁"}`,
    variables: {
      p: { type: "enum", values: ["idle", "critical"] },
      q: { type: "enum", values: ["idle", "critical"] },
      locked: { type: "bool" },
    },
    initial: [{ p: "idle", q: "idle", locked: false }],
    actions: ["p", "q"].flatMap((n) => [
      action(
        `${n} 进入临界区`,
        e("and", eq(n, "idle"), bad ? true : e("not", v("locked"))),
        { [n]: "critical", locked: true },
      ),
      action(`${n} 退出临界区`, eq(n, "critical"), {
        [n]: "idle",
        locked: false,
      }),
    ]),
    invariants: [
      {
        name: "两个进程不能同时在临界区",
        expr: e("not", e("and", eq("p", "critical"), eq("q", "critical"))),
      },
    ],
    terminal: false,
    goals: [{ name: "q 可进入临界区", expr: eq("q", "critical") }],
  };
}
function locks(bad: boolean): Model {
  const actions: Action[] = [];
  for (const n of ["p", "q"]) {
    const first = bad && n === "q" ? "b" : "a",
      second = first === "a" ? "b" : "a";
    actions.push(
      action(`${n} 1 获取 ${first}`, e("and", eq(n, 0), eq(first, "free")), {
        [n]: 1,
        [first]: n,
      }),
    );
    actions.push(
      action(`${n} 2 获取 ${second}`, e("and", eq(n, 1), eq(second, "free")), {
        [n]: 2,
        [second]: n,
      }),
    );
    actions.push(
      action(`${n} 3 释放双锁`, eq(n, 2), { [n]: 3, a: "free", b: "free" }),
    );
  }
  return {
    name: `双锁死锁 · ${bad ? "错误：反向获取" : "正确：统一顺序"}`,
    variables: {
      p: { type: "int", min: 0, max: 3 },
      q: { type: "int", min: 0, max: 3 },
      a: { type: "enum", values: ["free", "p", "q"] },
      b: { type: "enum", values: ["free", "p", "q"] },
    },
    initial: [{ p: 0, q: 0, a: "free", b: "free" }],
    actions,
    invariants: [
      {
        name: "持有双锁的进程确实拥有锁",
        expr: e(
          "and",
          e("or", e("!=", v("p"), 2), e("and", eq("a", "p"), eq("b", "p"))),
          e("or", e("!=", v("q"), 2), e("and", eq("a", "q"), eq("b", "q"))),
        ),
      },
    ],
    terminal: e("and", eq("p", 3), eq("q", 3)),
    goals: [{ name: "两进程完成", expr: e("and", eq("p", 3), eq("q", 3)) }],
  };
}
function bank(bad: boolean): Model {
  return {
    name: `银行余额守恒 · ${bad ? "错误：转账漏记" : "正确：原子转账"}`,
    variables: {
      a: { type: "int", min: 0, max: 3 },
      b: { type: "int", min: 0, max: 3 },
    },
    initial: [{ a: 2, b: 1 }],
    actions: [
      action("a 转给 b", e("and", e(">", v("a"), 0), e("<", v("b"), 3)), {
        a: e("-", v("a"), 1),
        b: bad ? v("b") : e("+", v("b"), 1),
      }),
      action("b 转给 a", e("and", e(">", v("b"), 0), e("<", v("a"), 3)), {
        b: e("-", v("b"), 1),
        a: e("+", v("a"), 1),
      }),
    ],
    invariants: [
      { name: "余额总和为 3", expr: e("==", e("+", v("a"), v("b")), 3) },
    ],
    terminal: false,
    goals: [{ name: "b 收到全部余额", expr: eq("b", 3) }],
  };
}
function buffer(bad: boolean): Model {
  return {
    name: `有界生产者消费者 · ${bad ? "错误：消费不减库存" : "正确：有界队列"}`,
    variables: {
      count: { type: "int", min: 0, max: 2 },
      produced: { type: "int", min: 0, max: 3 },
      consumed: { type: "int", min: 0, max: 3 },
    },
    initial: [{ count: 0, produced: 0, consumed: 0 }],
    actions: [
      action(
        "生产",
        e("and", e("<", v("produced"), 3), e("<", v("count"), 2)),
        { produced: e("+", v("produced"), 1), count: e("+", v("count"), 1) },
      ),
      action(
        "消费",
        e("and", e(">", v("count"), 0), e("<", v("consumed"), 3)),
        {
          consumed: e("+", v("consumed"), 1),
          count: bad ? v("count") : e("-", v("count"), 1),
        },
      ),
    ],
    invariants: [
      {
        name: "库存等于生产减消费",
        expr: e("==", v("count"), e("-", v("produced"), v("consumed"))),
      },
    ],
    terminal: e("and", eq("produced", 3), eq("consumed", 3)),
    goals: [{ name: "全部消费完成", expr: eq("consumed", 3) }],
  };
}
export const examples = [
  { id: "mutex-good", group: "双进程互斥", good: true, model: mutex(false) },
  { id: "mutex-bad", group: "双进程互斥", good: false, model: mutex(true) },
  { id: "locks-good", group: "双锁死锁", good: true, model: locks(false) },
  { id: "locks-bad", group: "双锁死锁", good: false, model: locks(true) },
  { id: "bank-good", group: "银行余额守恒", good: true, model: bank(false) },
  { id: "bank-bad", group: "银行余额守恒", good: false, model: bank(true) },
  {
    id: "buffer-good",
    group: "有界生产者消费者",
    good: true,
    model: buffer(false),
  },
  {
    id: "buffer-bad",
    group: "有界生产者消费者",
    good: false,
    model: buffer(true),
  },
];
