import type { BatchConfig, Snapshot } from "../core/types";
export type Command =
  | { type: "start"; id: string; config: BatchConfig }
  | { type: "pause" | "resume" | "cancel"; id: string };
export interface Reply {
  id: string;
  snapshot: Snapshot;
}
