import {
  CHARACTER_ACTIONS,
  actionDuration,
  type CharacterAction,
} from "../data/characterAnimations";
import type { Phase } from "../core/types";
export interface PoseEvents {
  cast: number;
  hurt: number;
  dash: number;
}
export class CharacterAnimation {
  action: CharacterAction = "idle";
  elapsed = 0;
  facing = 1;
  private seen: PoseEvents = { cast: 0, hurt: 0, dash: 0 };
  reset() {
    this.action = "idle";
    this.elapsed = 0;
    this.facing = 1;
    this.seen = { cast: 0, hurt: 0, dash: 0 };
  }
  update(
    dt: number,
    phase: Phase,
    presentationTime: number,
    moving: boolean,
    dx: number,
    events: PoseEvents,
  ) {
    const critical = ["dying", "revive", "dead"].includes(phase)
      ? "defeat"
      : phase === "reviving"
        ? "revive"
        : null;
    if (critical) {
      this.action = critical;
      this.elapsed = Math.min(actionDuration(critical), presentationTime);
      this.seen = { ...events };
      return;
    }
    if (phase !== "playing") return;
    if (Math.abs(dx) > 0.001) this.facing = dx < 0 ? -1 : 1;
    if (this.action === "revive" || this.action === "defeat") {
      this.action = moving ? "run" : "idle";
      this.elapsed = 0;
    }
    this.elapsed += Math.max(0, dt);
    if (
      !CHARACTER_ACTIONS[this.action].loop &&
      this.elapsed >= actionDuration(this.action)
    ) {
      this.action = moving ? "run" : "idle";
      this.elapsed = 0;
    }
    const requested = (["hurt", "dash", "cast"] as const).find(
      (k) => events[k] !== this.seen[k],
    );
    this.seen = { ...events };
    if (
      requested &&
      CHARACTER_ACTIONS[requested].priority >=
        CHARACTER_ACTIONS[this.action].priority
    ) {
      this.action = requested;
      this.elapsed = 0;
    } else if (CHARACTER_ACTIONS[this.action].loop) {
      const next = moving ? "run" : "idle";
      if (next !== this.action) {
        this.action = next;
        this.elapsed = 0;
      }
    }
  }
  frame(
    frames: number = CHARACTER_ACTIONS[this.action].frames,
    fps: number = CHARACTER_ACTIONS[this.action].fps,
  ) {
    const def = CHARACTER_ACTIONS[this.action];
    // All one-shots fit the standard presentation window even with custom sheet metadata.
    return def.loop
      ? Math.floor(this.elapsed * fps) % frames
      : Math.min(
          frames - 1,
          Math.floor((this.elapsed / actionDuration(this.action)) * frames),
        );
  }
}
