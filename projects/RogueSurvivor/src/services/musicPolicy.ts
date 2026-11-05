import type { Run } from "../core/types";
export type MusicState = "playing" | "paused" | "stopped";
/** Manual pause/visibility always override modal screens, independent of logic time. */
export function musicState(
  run: Run | undefined,
  screen: string,
  manual: boolean,
  hidden: boolean,
): MusicState {
  if (
    !run ||
    run.phase === "dead" ||
    run.phase === "victory" ||
    ["home", "select", "result"].includes(screen)
  )
    return "stopped";
  if (manual || hidden) return "paused";
  return [
    "game",
    "upgrade",
    "build",
    "codex",
    "dying",
    "revive",
    "reviving",
  ].includes(screen)
    ? "playing"
    : "paused";
}
