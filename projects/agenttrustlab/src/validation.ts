import {
  OPERATIONS,
  POLICIES,
  RESOURCES,
  SCOPES,
  TOOLS,
  type ExperimentConfig,
  type Request,
} from "./types";
import { getScenarios } from "./scenarios";
export const MAX_IMPORT_BYTES = 131072;
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new Error("应为普通对象");
  const result = value as Record<string, unknown>;
  if (
    Object.keys(result).some((k) => !keys.includes(k)) ||
    keys.some((k) => !Object.hasOwn(result, k))
  )
    throw new Error("字段缺失或包含未知字段");
  return result;
}
function list<T extends string>(
  value: unknown,
  values: readonly T[],
  max: number,
): T[] {
  if (
    !Array.isArray(value) ||
    value.length > max ||
    value.some((v) => typeof v !== "string" || !values.includes(v as T)) ||
    new Set(value).size !== value.length
  )
    throw new Error("列表包含非法值、重复值或超限");
  return [...value] as T[];
}
export function validateConfig(value: unknown): ExperimentConfig {
  const x = object(value, [
    "version",
    "seed",
    "scenarioIds",
    "policies",
    "settings",
  ]);
  if (
    x.version !== 1 ||
    !Number.isInteger(x.seed) ||
    Number(x.seed) < 0 ||
    Number(x.seed) > 4294967295
  )
    throw new Error("版本或种子无效");
  const s = object(x.settings, [
    "tools",
    "resources",
    "operations",
    "taskScopes",
    "requireConfirmation",
  ]);
  if (typeof s.requireConfirmation !== "boolean")
    throw new Error("确认要求必须是布尔值");
  const config: ExperimentConfig = {
    version: 1,
    seed: x.seed as number,
    scenarioIds: list(
      x.scenarioIds,
      getScenarios().map((s) => s.id),
      18,
    ),
    policies: list(x.policies, POLICIES, 4),
    settings: {
      tools: list(s.tools, TOOLS, 6),
      resources: list(s.resources, RESOURCES, 8),
      operations: list(s.operations, OPERATIONS, 6),
      taskScopes: list(s.taskScopes, SCOPES, 5),
      requireConfirmation: s.requireConfirmation,
    },
  };
  if (!config.scenarioIds.length || !config.policies.length)
    throw new Error("至少选择一个场景和策略");
  return config;
}
export function parseConfig(text: string): ExperimentConfig {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES)
    throw new Error("配置超过 128 KiB");
  try {
    return validateConfig(JSON.parse(text));
  } catch (error) {
    throw new Error(
      `配置导入失败：${error instanceof Error ? error.message : "非法 JSON"}`,
    );
  }
}
export function validateRequest(value: unknown): string | null {
  try {
    const r = object(value, ["tool", "resource", "operation", "args"]);
    if (
      !TOOLS.includes(r.tool as Request["tool"]) ||
      !RESOURCES.includes(r.resource as Request["resource"]) ||
      !OPERATIONS.includes(r.operation as Request["operation"])
    )
      throw new Error("工具、资源或操作枚举无效");
    if (
      !r.args ||
      typeof r.args !== "object" ||
      Array.isArray(r.args) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(r.args))
    )
      throw new Error("参数须为对象");
    const args = r.args as Record<string, unknown>;
    const tool = r.tool as Request["tool"];
    const compatible: Record<Request["tool"], readonly string[]> = {
      "doc.read": [
        "docs/public",
        "docs/team",
        "docs/secret",
        "docs/unavailable",
      ],
      "doc.search": ["docs/public", "docs/team", "docs/secret"],
      "mail.send": ["mailbox/demo"],
      "file.delete": ["archive/draft"],
      "data.export": ["external/collector"],
      "system.configure": ["system/settings"],
    };
    if (!compatible[tool].includes(String(r.resource)))
      throw new Error("工具与资源类型不匹配");
    const op = {
      "doc.read": "read",
      "doc.search": "search",
      "mail.send": "send",
      "file.delete": "delete",
      "data.export": "export",
      "system.configure": "configure",
    }[tool];
    if (r.operation !== op) throw new Error("工具与操作不匹配");
    const allowed =
      tool === "doc.search"
        ? ["limit"]
        : tool === "mail.send"
          ? ["content", "recipient"]
          : ["data.export", "system.configure"].includes(tool)
            ? ["content"]
            : [];
    if (Object.keys(args).some((k) => !allowed.includes(k)))
      throw new Error("未知或伪造参数");
    if (
      Object.hasOwn(args, "content") &&
      (typeof args.content !== "string" || args.content.length > 1024)
    )
      throw new Error("文本参数超限或类型错误");
    if (
      tool === "mail.send" &&
      (typeof args.content !== "string" ||
        typeof args.recipient !== "string" ||
        !/^[a-z]{1,32}@example\.invalid$/.test(args.recipient))
    )
      throw new Error("模拟发送必须使用保留域与有界文本");
    if (
      tool === "doc.search" &&
      (!Number.isInteger(args.limit) ||
        Number(args.limit) < 1 ||
        Number(args.limit) > 10)
    )
      throw new Error("搜索数量须为 1–10 的整数");
    if (tool === "data.export" && typeof args.content !== "string")
      throw new Error("导出缺少文本");
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "参数非法";
  }
}
export function defaultConfig(): ExperimentConfig {
  return {
    version: 1,
    seed: 2026,
    scenarioIds: getScenarios().map((s) => s.id),
    policies: [...POLICIES],
    settings: {
      tools: TOOLS.filter((t) => t !== "system.configure"),
      resources: RESOURCES.filter(
        (r) => !["docs/secret", "system/settings"].includes(r),
      ),
      operations: OPERATIONS.filter((o) => o !== "configure"),
      taskScopes: SCOPES.filter((s) => s !== "administration"),
      requireConfirmation: true,
    },
  };
}
