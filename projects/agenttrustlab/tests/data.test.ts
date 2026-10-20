import { expect, it } from "vitest";
import {
  defaultConfig,
  MAX_IMPORT_BYTES,
  parseConfig,
  validateConfig,
} from "../src/validation";
import {
  csvCell,
  exportConfig,
  exportCsv,
  exportExperiment,
} from "../src/serialization";
import { runExperiment } from "../src/experiment";
import type { ExperimentConfig } from "../src/types";
// Independent RFC4180 reader; does not reuse writer logic.
export function readCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && ch === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && ch === "\r" && source[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += ch;
  }
  if (quoted) throw new Error("unclosed CSV");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
it("配置JSON回环、结果JSON精确包含轨迹和指标", () => {
  const c = defaultConfig();
  expect(parseConfig(exportConfig(c))).toEqual(c);
  const e = runExperiment(c);
  expect(JSON.parse(exportExperiment(e))).toEqual(e);
});
it("CSV独立解析所有完整轨迹与JSON结果一致", () => {
  const e = runExperiment(defaultConfig(), ["n03"]);
  const rows = readCsv(exportCsv(e));
  expect(rows[0]).toEqual([
    "scenarioId",
    "policy",
    "malicious",
    "proposed",
    "allowed",
    "execution",
    "reason",
    "traceJson",
  ]);
  expect(rows).toHaveLength(73);
  rows.slice(1).forEach((row, i) => {
    expect(JSON.parse(row[7])).toEqual(e.records[i]);
    expect(row[0]).toBe(e.records[i].scenarioId);
    expect(row[4]).toBe(String(e.records[i].authorization.allowed));
  });
});
it.each([
  "a,b",
  '"quote"',
  "line\r\nbreak",
  "中文 😀",
  "<script>alert(1)</script>",
  "ordinary",
])("CSV转义 %s", (value) =>
  expect(readCsv(csvCell(value) + "\r\n")).toEqual([[value]]),
);
it.each([
  "=1+1",
  "+SUM(A1)",
  "-2",
  "@cmd",
  "\t=cmd",
  " \r\n+cmd",
  "\u0000@cmd",
  "\u00a0=cmd",
])("阻止电子表格公式 %j", (value) =>
  expect(readCsv(csvCell(value) + "\r\n")).toEqual([["'" + value]]),
);
it.each([
  "",
  "{",
  "[]",
  "null",
  "1",
  '"text"',
  '{"__proto__":{"polluted":true}}',
])("非法JSON或根结构安全拒绝 %j", (value) =>
  expect(() => parseConfig(value)).toThrow(),
);
const mutations: Array<[string, (c: Record<string, unknown>) => void]> = [
  ["未知字段", (c) => (c.code = "globalThis.__executed = true")],
  ["版本", (c) => (c.version = 2)],
  ["种子字符串", (c) => (c.seed = "2")],
  ["种子小数", (c) => (c.seed = 1.5)],
  ["负种子", (c) => (c.seed = -1)],
  ["种子溢出", (c) => (c.seed = 4294967296)],
  ["无场景", (c) => (c.scenarioIds = [])],
  ["无策略", (c) => (c.policies = [])],
  ["未知场景", (c) => (c.scenarioIds = ["../private"])],
  ["重复场景", (c) => (c.scenarioIds = ["n01", "n01"])],
  ["未知策略", (c) => (c.policies = ["allow-all"])],
  ["策略类型", (c) => (c.policies = "least")],
  ["伪造确认", (c) => (c.confirmations = ["n03"])],
  ["场景脚本", (c) => (c.scenarios = [{ script: "alert(1)" }])],
  ["缺少字段", (c) => delete c.settings],
  ["settings数组", (c) => (c.settings = [])],
  [
    "确认类型",
    (c) =>
      ((c.settings as Record<string, unknown>).requireConfirmation = "true"),
  ],
  [
    "资源枚举",
    (c) => ((c.settings as Record<string, unknown>).resources = ["/private"]),
  ],
  [
    "操作枚举",
    (c) => ((c.settings as Record<string, unknown>).operations = ["exec"]),
  ],
  ["工具类型", (c) => ((c.settings as Record<string, unknown>).tools = [3])],
  [
    "工具脚本",
    (c) =>
      ((c.settings as Record<string, unknown>).tools = [
        "globalThis.__executed=true",
      ]),
  ],
  [
    "任务枚举",
    (c) => ((c.settings as Record<string, unknown>).taskScopes = ["superuser"]),
  ],
  [
    "未知嵌套字段",
    (c) => ((c.settings as Record<string, unknown>).script = "x"),
  ],
  [
    "重复工具",
    (c) =>
      ((c.settings as Record<string, unknown>).tools = [
        "doc.read",
        "doc.read",
      ]),
  ],
];
it.each(mutations)("严格配置校验 %s", (_, mutate) => {
  const c = JSON.parse(JSON.stringify(defaultConfig()));
  mutate(c);
  expect(() => parseConfig(JSON.stringify(c))).toThrow();
});
it("拒绝超大ASCII及多字节输入", () => {
  expect(() => parseConfig(" ".repeat(MAX_IMPORT_BYTES + 1))).toThrow(
    "128 KiB",
  );
  expect(() => parseConfig("中".repeat(50000))).toThrow("128 KiB");
});
it("不执行脚本、表达式、原型污染；纯数据解析", () => {
  const payload = JSON.stringify({
    ...defaultConfig(),
    script: "globalThis.__agentTrustExecuted = true",
  });
  expect(() => parseConfig(payload)).toThrow();
  expect(Object.hasOwn(globalThis, "__agentTrustExecuted")).toBe(false);
  expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
});
it("空权限列表合法，用于拒绝策略；非法对象原型拒绝", () => {
  const c = defaultConfig();
  c.settings.tools = [];
  expect(validateConfig(c).settings.tools).toEqual([]);
  expect(() => validateConfig(Object.create({ version: 1 }))).toThrow();
});
it("配置验证返回深副本，导入不携带确认", () => {
  const c = defaultConfig();
  const out = validateConfig(c);
  c.settings.tools = [];
  expect(out.settings.tools).toHaveLength(5);
  expect(Object.keys(out)).toEqual([
    "version",
    "seed",
    "scenarioIds",
    "policies",
    "settings",
  ]);
});
it("100种子子集均满足独立计数不变量", () => {
  for (let seed = 0; seed < 100; seed++) {
    const c: ExperimentConfig = defaultConfig();
    c.seed = seed;
    c.scenarioIds = c.scenarioIds.filter((_, i) => (i + seed) % 3 !== 0);
    const e = runExperiment(c);
    for (const p of c.policies) {
      const rows = e.records.filter((r) => r.policy === p);
      const m = e.metrics[p]!;
      expect(m.total).toBe(c.scenarioIds.length);
      expect(m.allowed + m.denied).toBe(rows.length);
      expect(m.executed + m.executionFailed).toBe(m.allowed);
      expect(m.malicious + m.normal).toBe(rows.length);
      expect(m.unauthorizedSuccess).toBe(
        rows.reduce(
          (n, r) => n + Number(r.malicious && r.execution.status === "success"),
          0,
        ),
      );
    }
  }
});
