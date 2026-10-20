import { getScenario } from "./scenarios";
import { validateConfig, validateRequest, defaultConfig } from "./validation";
import type { Check, Decision, Policy, Request, Settings } from "./types";
// Capabilities are opaque, bound to a request snapshot, and consumed once.
const capabilities = new WeakMap<object, Request>();
export function consumeAuthorization(capability: unknown): Request {
  if (!capability || typeof capability !== "object")
    throw new Error("缺少有效授权凭证");
  const request = capabilities.get(capability);
  if (!request) throw new Error("授权凭证无效或已使用");
  capabilities.delete(capability);
  return structuredClone(request);
}
export function createAuthorizer(
  policy: Policy,
  settings: Settings,
  simulatedConfirmations: readonly string[] = [],
) {
  const config = validateConfig({
    ...defaultConfig(),
    policies: [policy],
    settings,
  });
  const rules = config.settings;
  const confirmations = new Set(simulatedConfirmations);
  return (
    scenarioId: string,
    input: Request,
  ): { decision: Decision; capability?: object } => {
    const scenario = getScenario(scenarioId);
    const request = structuredClone(input);
    const checks: Check[] = [];
    const check = (
      name: Check["name"],
      enabled: boolean,
      ok: boolean,
      pass: string,
      fail: string,
    ) => {
      checks.push({
        name,
        status: enabled ? (ok ? "pass" : "fail") : "skipped",
        reason: enabled ? (ok ? pass : fail) : "此策略不检查此项",
      });
    };
    const invalid = validateRequest(request);
    check(
      "parameters",
      true,
      !invalid,
      "参数结构、工具操作映射与大小有效",
      invalid ?? "参数无效",
    );
    if (invalid) {
      for (const name of [
        "tool",
        "resource",
        "operation",
        "task",
        "confirmation",
      ] as const)
        check(name, false, false, "", "");
      return { decision: { allowed: false, checks, reasons: [invalid] } };
    }
    const independent = policy !== "baseline";
    const least = policy === "least" || policy === "confirmation";
    check(
      "tool",
      independent,
      rules.tools.includes(request.tool),
      "工具在白名单内",
      "工具不在白名单内",
    );
    check(
      "resource",
      least,
      rules.resources.includes(request.resource),
      "目标在资源访问范围内",
      "目标资源未获授权",
    );
    check(
      "operation",
      independent,
      rules.operations.includes(request.operation),
      "操作类型已授权",
      "操作类型未获授权",
    );
    const taskAllowed =
      rules.taskScopes.includes(scenario.taskScope) &&
      scenario.grants.some(
        (g) =>
          g.tool === request.tool &&
          g.resource === request.resource &&
          g.operation === request.operation,
      );
    check(
      "task",
      least,
      taskAllowed,
      "任务范围及精确工具/资源/操作授权匹配",
      "超出当前任务的权限范围",
    );
    const highRisk =
      ["send", "delete", "export", "configure"].includes(request.operation) ||
      request.resource === "docs/secret";
    const canonical = scenario.request;
    const matchesConfirmedRequest =
      request.tool === canonical.tool &&
      request.resource === canonical.resource &&
      request.operation === canonical.operation &&
      request.args.content === canonical.args.content &&
      request.args.recipient === canonical.args.recipient &&
      request.args.limit === canonical.args.limit;
    check(
      "confirmation",
      policy === "confirmation" && rules.requireConfirmation && highRisk,
      confirmations.has(scenarioId) && matchesConfirmedRequest,
      "已取得应用层模拟确认（不是真实用户授权）",
      "缺少应用层模拟确认；不可信内容不能授予确认",
    );
    const reasons = checks
      .filter((c) => c.status === "fail")
      .map((c) => c.reason);
    const decision: Decision = {
      allowed: reasons.length === 0,
      checks,
      reasons: reasons.length ? reasons : ["此策略的适用检查全部通过"],
    };
    if (!decision.allowed) return { decision };
    const capability = Object.freeze({});
    capabilities.set(capability, request);
    return { decision, capability };
  };
}
