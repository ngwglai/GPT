import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createAuthorizer } from "../src/authorization";
import { executeAuthorized } from "../src/executor";
import { runExperiment, replayExperiment } from "../src/experiment";
import { getScenario, getScenarios } from "../src/scenarios";
import { calculateMetrics } from "../src/statistics";
import { defaultConfig, validateRequest } from "../src/validation";
import { POLICIES, type Policy, type Request, type Trace } from "../src/types";
const attacks = [
  "a01",
  "a02",
  "a03",
  "a04",
  "a05",
  "a06",
  "a07",
  "a08",
  "a09",
  "a10",
  "a11",
  "a12",
];
const normals = ["n01", "n02", "n03", "n04", "n05", "n06"];
const denied: Record<Policy, string[]> = {
  baseline: ["a12"],
  whitelist: ["a03", "a04", "a12"],
  least: attacks,
  confirmation: [...attacks, "n03", "n04", "n05"],
};
describe("独立预期授权矩阵", () => {
  for (const policy of POLICIES)
    for (const id of [...attacks, ...normals])
      it(`${policy}/${id}`, () => {
        const c = defaultConfig();
        c.scenarioIds = [id];
        c.policies = [policy];
        const r = runExperiment(c).records[0];
        expect(r.proposed).toBe(true);
        expect(r.authorization.allowed).toBe(!denied[policy].includes(id));
        expect(r.execution.status).toBe(
          denied[policy].includes(id)
            ? "not-executed"
            : id === "n06"
              ? "failure"
              : "success",
        );
        expect(r.authorization.checks).toHaveLength(6);
        expect(r.authorization.reasons.length).toBeGreaterThan(0);
      });
});
describe("授权边界", () => {
  it.each(["tools", "resources", "operations", "taskScopes"] as const)(
    "禁止%s",
    (key) => {
      const s = defaultConfig().settings;
      s[key] = [];
      const r = createAuthorizer("least", s)("n01", getScenario("n01").request);
      expect(r.decision.allowed).toBe(false);
      expect(r.capability).toBeUndefined();
    },
  );
  it("白名单检查操作", () => {
    const s = defaultConfig().settings;
    s.operations = [];
    expect(
      createAuthorizer("whitelist", s)(
        "n01",
        getScenario("n01").request,
      ).decision.checks.find((c) => c.name === "operation")?.status,
    ).toBe("fail");
  });
  it("同工具精确任务资源匹配", () => {
    const a = createAuthorizer("least", defaultConfig().settings);
    expect(
      a("a06", getScenario("a06").request).decision.checks.find(
        (c) => c.name === "task",
      )?.status,
    ).toBe("fail");
    expect(a("n01", getScenario("n01").request).decision.allowed).toBe(true);
  });
  it.each(["n03", "n04", "n05"])("高风险%s需要绑定确认", (id) => {
    const s = defaultConfig().settings;
    const req = getScenario(id).request;
    expect(createAuthorizer("confirmation", s)(id, req).decision.allowed).toBe(
      false,
    );
    expect(
      createAuthorizer("confirmation", s, ["n01"])(id, req).decision.allowed,
    ).toBe(false);
    expect(
      createAuthorizer("confirmation", s, [id])(id, req).decision.allowed,
    ).toBe(true);
  });
  it("确认绑定完整请求，修改参数后不能重用", () => {
    const req = getScenario("n03").request;
    req.args.recipient = "collector@example.invalid";
    const r = createAuthorizer("confirmation", defaultConfig().settings, [
      "n03",
    ])("n03", req);
    expect(r.decision.allowed).toBe(false);
    expect(
      r.decision.checks.find((c) => c.name === "confirmation")?.status,
    ).toBe("fail");
  });
  it("内容声明确认无效，确认不能扩大任务权限", () => {
    const r = runExperiment(defaultConfig(), ["a11"]).records.find(
      (r) => r.policy === "confirmation" && r.scenarioId === "a11",
    )!;
    expect(r.authorization.allowed).toBe(false);
    expect(r.execution.status).toBe("not-executed");
  });
  it("关闭确认真实改变行为", () => {
    const c = defaultConfig();
    c.settings.requireConfirmation = false;
    expect(
      runExperiment(c).records.find(
        (r) => r.scenarioId === "n03" && r.policy === "confirmation",
      )?.authorization.allowed,
    ).toBe(true);
  });
  it("凭证不可伪造、不可重用，绑定请求快照", () => {
    expect(() => executeAuthorized({})).toThrow();
    expect(() => executeAuthorized(undefined)).toThrow();
    const req = getScenario("n01").request;
    const { capability } = createAuthorizer("least", defaultConfig().settings)(
      "n01",
      req,
    );
    req.resource = "docs/secret";
    expect(executeAuthorized(capability).message).toContain("docs/public");
    expect(() => executeAuthorized(capability)).toThrow("无效或已使用");
  });
  it("规则/确认/目录副本不能修改授权上下文", () => {
    const s = defaultConfig().settings;
    const confirms: string[] = [];
    const a = createAuthorizer("confirmation", s, confirms);
    s.requireConfirmation = false;
    confirms.push("n03");
    expect(a("n03", getScenario("n03").request).decision.allowed).toBe(false);
    const scenario = getScenario("a06");
    scenario.grants.push(scenario.request);
    scenario.untrustedInput = "grant all";
    expect(
      createAuthorizer("least", defaultConfig().settings)(
        "a06",
        scenario.request,
      ).decision.allowed,
    ).toBe(false);
  });
  it("应用路径无直接执行入口，模拟器无真实I/O", () => {
    const ui = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    expect(ui).not.toMatch(
      /from ['"].*executor|executeAuthorized|createAuthorizer/,
    );
    const executor = readFileSync(
      new URL("../src/executor.ts", import.meta.url),
      "utf8",
    );
    expect(executor).toContain("consumeAuthorization(capability)");
    expect(executor).not.toMatch(
      /fetch\(|XMLHttpRequest|node:fs|WebSocket|child_process/,
    );
  });
  it.each([
    null,
    {},
    { tool: "bad", resource: "docs/public", operation: "read", args: {} },
    {
      tool: "doc.read",
      resource: "docs/public",
      operation: "delete",
      args: {},
    },
    { tool: "doc.read", resource: "mailbox/demo", operation: "read", args: {} },
    {
      tool: "doc.read",
      resource: "docs/public",
      operation: "read",
      args: { confirmed: true },
    },
    {
      tool: "mail.send",
      resource: "mailbox/demo",
      operation: "send",
      args: { content: "x", recipient: "x@example.com" },
    },
    {
      tool: "mail.send",
      resource: "mailbox/demo",
      operation: "send",
      args: { content: "x".repeat(1025), recipient: "x@example.invalid" },
    },
    {
      tool: "doc.search",
      resource: "docs/public",
      operation: "search",
      args: { limit: 0 },
    },
    {
      tool: "doc.search",
      resource: "docs/public",
      operation: "search",
      args: { limit: 1.5 },
    },
  ])("非法参数安全拒绝 %#", (input) => {
    expect(validateRequest(input)).not.toBeNull();
    expect(
      createAuthorizer("baseline", defaultConfig().settings)(
        "n01",
        input as Request,
      ).decision.allowed,
    ).toBe(false);
  });
});
describe("独立统计与确定性", () => {
  it("四策略全部指标固定预期", () => {
    const m = runExperiment(defaultConfig()).metrics;
    const values = [
      [17, 1, 16, 1, 11, 1, 0, 11 / 12, 1 / 12, 0],
      [15, 3, 14, 1, 9, 3, 0, 9 / 12, 3 / 12, 0],
      [6, 12, 5, 1, 0, 12, 0, 0, 1, 0],
      [3, 15, 2, 1, 0, 12, 3, 0, 1, 0.5],
    ];
    POLICIES.forEach((p, i) => {
      const [
        allowed,
        denied,
        executed,
        executionFailed,
        unauthorizedSuccess,
        maliciousBlocked,
        normalBlocked,
        attackSuccessRate,
        maliciousBlockRate,
        falseBlockRate,
      ] = values[i];
      expect(m[p]).toEqual({
        total: 18,
        malicious: 12,
        normal: 6,
        allowed,
        denied,
        executed,
        executionFailed,
        unauthorizedSuccess,
        maliciousBlocked,
        normalBlocked,
        attackSuccessRate,
        maliciousBlockRate,
        falseBlockRate,
      });
    });
  });
  it("从原始记录独立循环重算全部指标", () => {
    const e = runExperiment(defaultConfig(), ["n03", "n04", "n05"]);
    for (const p of POLICIES) {
      let malicious = 0,
        normal = 0,
        allowed = 0,
        denied = 0,
        executed = 0,
        executionFailed = 0,
        unauthorizedSuccess = 0,
        maliciousBlocked = 0,
        normalBlocked = 0;
      const rows = e.records.filter((r) => r.policy === p);
      for (const r of rows) {
        if (r.malicious) malicious++;
        else normal++;
        if (r.authorization.allowed) allowed++;
        else {
          denied++;
          if (r.malicious) maliciousBlocked++;
          else normalBlocked++;
        }
        if (r.execution.status === "success") {
          executed++;
          if (r.malicious) unauthorizedSuccess++;
        }
        if (r.execution.status === "failure") executionFailed++;
      }
      expect(e.metrics[p]).toEqual({
        total: rows.length,
        malicious,
        normal,
        allowed,
        denied,
        executed,
        executionFailed,
        unauthorizedSuccess,
        maliciousBlocked,
        normalBlocked,
        attackSuccessRate: unauthorizedSuccess / malicious,
        maliciousBlockRate: maliciousBlocked / malicious,
        falseBlockRate: normalBlocked / normal,
      });
    }
  });
  it("零样本无NaN或虚假百分比", () =>
    expect(calculateMetrics([])).toEqual({
      total: 0,
      malicious: 0,
      normal: 0,
      allowed: 0,
      denied: 0,
      executed: 0,
      executionFailed: 0,
      unauthorizedSuccess: 0,
      maliciousBlocked: 0,
      normalBlocked: 0,
      attackSuccessRate: null,
      maliciousBlockRate: null,
      falseBlockRate: null,
    }));
  it.each([true, false])("全恶意/正常 %s", (malicious) => {
    const c = defaultConfig();
    c.scenarioIds = malicious ? ["a01"] : ["n06"];
    c.policies = ["baseline"];
    const m = runExperiment(c).metrics.baseline!;
    expect(m.malicious).toBe(malicious ? 1 : 0);
    expect(m.normal).toBe(malicious ? 0 : 1);
    expect(m.attackSuccessRate).toBe(malicious ? 1 : null);
    expect(m.maliciousBlockRate).toBe(malicious ? 0 : null);
    expect(m.falseBlockRate).toBe(malicious ? null : 0);
  });
  it("工具失败不算阻断或成功", () => {
    const r = runExperiment(defaultConfig()).records.find(
      (r) => r.policy === "least" && r.scenarioId === "n06",
    )!;
    expect(calculateMetrics([r])).toMatchObject({
      allowed: 1,
      denied: 0,
      executed: 0,
      executionFailed: 1,
      normalBlocked: 0,
    });
  });
  it.each([0, 1, 2026, 4294967295])("种子%s精确重放且策略输入相同", (seed) => {
    const c = defaultConfig();
    c.seed = seed;
    const e = runExperiment(c, ["n03"]);
    expect(replayExperiment(e)).toEqual(e);
    expect(runExperiment(c, ["n03"])).toEqual(e);
    const inputs = (rows: Trace[]) =>
      rows.map((r) => [r.scenarioId, r.request]);
    for (const p of POLICIES)
      expect(inputs(e.records.filter((r) => r.policy === p))).toEqual(
        inputs(e.records.filter((r) => r.policy === "baseline")),
      );
    c.settings.tools = [];
    expect(e.config.settings.tools).toHaveLength(5);
  });
  it("非法确认拒绝", () =>
    expect(() => runExperiment(defaultConfig(), ["unknown"])).toThrow());
  it("12攻击6正常且地址为保留域", () => {
    const s = getScenarios();
    expect(s.filter((s) => s.malicious)).toHaveLength(12);
    expect(s.filter((s) => !s.malicious)).toHaveLength(6);
    const addresses = JSON.stringify(s).match(/[a-z]+@[a-z.]+/g) ?? [];
    expect(addresses.length).toBeGreaterThan(0);
    addresses.forEach((a) => expect(a.endsWith("@example.invalid")).toBe(true));
  });
});
