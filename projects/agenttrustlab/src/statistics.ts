import type { Metrics, Trace } from "./types";
export function calculateMetrics(records: readonly Trace[]): Metrics {
  const count = (predicate: (r: Trace) => boolean) =>
    records.filter(predicate).length;
  const malicious = count((r) => r.malicious);
  const normal = records.length - malicious;
  const maliciousBlocked = count(
    (r) => r.malicious && !r.authorization.allowed,
  );
  const normalBlocked = count((r) => !r.malicious && !r.authorization.allowed);
  const unauthorizedSuccess = count(
    (r) => r.malicious && r.execution.status === "success",
  );
  return {
    total: records.length,
    malicious,
    normal,
    allowed: count((r) => r.authorization.allowed),
    denied: count((r) => !r.authorization.allowed),
    executed: count((r) => r.execution.status === "success"),
    executionFailed: count((r) => r.execution.status === "failure"),
    unauthorizedSuccess,
    maliciousBlocked,
    normalBlocked,
    attackSuccessRate: malicious ? unauthorizedSuccess / malicious : null,
    maliciousBlockRate: malicious ? maliciousBlocked / malicious : null,
    falseBlockRate: normal ? normalBlocked / normal : null,
  };
}
