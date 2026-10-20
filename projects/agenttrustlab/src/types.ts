export const TOOLS = [
  "doc.read",
  "doc.search",
  "mail.send",
  "file.delete",
  "data.export",
  "system.configure",
] as const;
export const RESOURCES = [
  "docs/public",
  "docs/team",
  "docs/secret",
  "mailbox/demo",
  "archive/draft",
  "external/collector",
  "system/settings",
  "docs/unavailable",
] as const;
export const OPERATIONS = [
  "read",
  "search",
  "send",
  "delete",
  "export",
  "configure",
] as const;
export const SCOPES = [
  "research",
  "delivery",
  "cleanup",
  "transfer",
  "administration",
] as const;
export const POLICIES = [
  "baseline",
  "whitelist",
  "least",
  "confirmation",
] as const;
export type Tool = (typeof TOOLS)[number];
export type Resource = (typeof RESOURCES)[number];
export type Operation = (typeof OPERATIONS)[number];
export type Scope = (typeof SCOPES)[number];
export type Policy = (typeof POLICIES)[number];
export interface Request {
  tool: Tool;
  resource: Resource;
  operation: Operation;
  args: { content?: string; recipient?: string; limit?: number };
}
export interface Grant {
  tool: Tool;
  resource: Resource;
  operation: Operation;
}
export interface Scenario {
  id: string;
  name: string;
  category: string;
  userTask: string;
  untrustedInput: string;
  trust: "user" | "document" | "tool";
  risk: "low" | "medium" | "high";
  request: Request;
  taskScope: Scope;
  grants: Grant[];
  malicious: boolean;
  expected: string;
}
export interface Settings {
  tools: Tool[];
  resources: Resource[];
  operations: Operation[];
  taskScopes: Scope[];
  requireConfirmation: boolean;
}
export interface ExperimentConfig {
  version: 1;
  seed: number;
  scenarioIds: string[];
  policies: Policy[];
  settings: Settings;
}
export interface Check {
  name:
    | "parameters"
    | "tool"
    | "resource"
    | "operation"
    | "task"
    | "confirmation";
  status: "pass" | "fail" | "skipped";
  reason: string;
}
export interface Decision {
  allowed: boolean;
  checks: Check[];
  reasons: string[];
}
export interface Trace {
  scenarioId: string;
  scenarioName: string;
  policy: Policy;
  trust: Scenario["trust"];
  risk: Scenario["risk"];
  malicious: boolean;
  request: Request;
  proposed: true;
  authorization: Decision;
  confirmation: "none" | "simulated";
  execution: {
    status: "not-executed" | "success" | "failure";
    message: string;
  };
}
export interface Metrics {
  total: number;
  malicious: number;
  normal: number;
  allowed: number;
  denied: number;
  executed: number;
  executionFailed: number;
  unauthorizedSuccess: number;
  maliciousBlocked: number;
  normalBlocked: number;
  attackSuccessRate: number | null;
  maliciousBlockRate: number | null;
  falseBlockRate: number | null;
}
export interface Experiment {
  config: ExperimentConfig;
  simulatedConfirmations: string[];
  records: Trace[];
  metrics: Partial<Record<Policy, Metrics>>;
}
export const POLICY_NAMES: Record<Policy, string> = {
  baseline: "基线：不独立授权",
  whitelist: "白名单与基础权限",
  least: "最小权限",
  confirmation: "最小权限 + 显式确认",
};
