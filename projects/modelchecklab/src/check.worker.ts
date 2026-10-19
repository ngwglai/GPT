import { check } from "./core/search";
import type { Request, Response } from "./worker-protocol";
import { interruptedResult } from "./worker-protocol";
let cancelled = false;
let started = false;
function send(message: Response) {
  self.postMessage(message);
}
self.onmessage = async (event: MessageEvent<Request>) => {
  if (event.data.type === "cancel") {
    cancelled = true;
    return;
  }
  if (started) return;
  started = true;
  const { text, limits } = event.data;
  try {
    const result = await check(text, {
      limits,
      cancelled: () => cancelled,
      onProgress: (stats) => send({ type: "progress", stats }),
    });
    send({ type: "result", result });
  } catch {
    send({
      type: "result",
      result: interruptedResult(
        "Worker 计算异常，无法完成检验",
        undefined,
        limits,
      ),
    });
  }
};
