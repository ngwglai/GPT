import { consumeAuthorization } from "./authorization";
import type { Trace } from "./types";
// No raw tool executor is exported. This module has no network, filesystem, or mailbox API.
export function executeAuthorized(capability: unknown): Trace["execution"] {
  const request = consumeAuthorization(capability);
  if (request.resource === "docs/unavailable")
    return {
      status: "failure",
      message: "模拟工具失败：虚构资源暂不可用（授权已通过）",
    };
  return {
    status: "success",
    message: `模拟执行完成：${request.tool} / ${request.resource} / ${request.operation}；未产生真实副作用`,
  };
}
