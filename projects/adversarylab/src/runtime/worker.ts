import { Runner } from "./runner";
import type { Command } from "./protocol";
const runner = new Runner((reply) => self.postMessage(reply));
self.onmessage = (event: MessageEvent<Command>) => runner.command(event.data);
