import type { Run, Vec } from "../core/types";
import { ENEMIES } from "../data/content";
export interface VisualPulse extends Vec {
  kind: string;
  age: number;
  duration: number;
  size: number;
}
interface Seen extends Vec {
  hp: number;
  maxHp: number;
  kind: string;
  r: number;
  phase: boolean;
  fleeing: boolean;
  stamp: number;
}
/** Observes snapshots without writing Run, using RNG, or changing combat events. */
export class BattleFeedback {
  readonly pulses: VisualPulse[] = [];
  private seen = new Map<number, Seen>();
  private time = 0;
  private stamp = 0;
  private hp = 0;
  private level = 1;
  private cards = 0;
  private initialized = false;
  reset(s: Run) {
    this.seen.clear();
    this.pulses.length = 0;
    this.initialized = false;
    this.observe(s);
  }
  private add(p: Vec, kind: string, size: number, duration = 0.45) {
    if (this.pulses.length < 96)
      this.pulses.push({ x: p.x, y: p.y, kind, size, age: 0, duration });
  }
  observe(s: Run) {
    const dt = Math.max(0, s.time - this.time);
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const pulse = this.pulses[i];
      pulse.age += dt;
      if (pulse.age >= pulse.duration) this.pulses.splice(i, 1);
    }
    const stamp = ++this.stamp;
    for (const e of s.enemies) {
      const prev = this.seen.get(e.id),
        phase = !!ENEMIES[e.kind].boss && e.hp / e.maxHp < 0.45;
      if (this.initialized) {
        if (!prev) this.add(e, "spawn", e.r * 3, 0.5);
        else {
          if (e.hp < prev.hp) this.add(e, "hit", Math.min(42, e.r * 2.4), 0.3);
          if (phase && !prev.phase) this.add(e, "phase", e.r * 4, 0.8);
        }
      }
      const snapshot = prev || ({} as Seen);
      snapshot.x = e.x;
      snapshot.y = e.y;
      snapshot.hp = e.hp;
      snapshot.maxHp = e.maxHp;
      snapshot.kind = e.kind;
      snapshot.r = e.r;
      snapshot.phase = phase;
      snapshot.stamp = stamp;
      snapshot.fleeing =
        e.kind === "mimic" &&
        !e.behavior?.awakened &&
        e.behavior?.escapeRemaining !== undefined;
      if (!prev) this.seen.set(e.id, snapshot);
    }
    for (const [id, e] of this.seen)
      if (e.stamp !== stamp) {
        if (this.initialized)
          this.add(
            e,
            e.fleeing ? "candy" : "dissolve",
            Math.min(90, e.r * 3),
            0.5,
          );
        this.seen.delete(id);
      }
    const p = s.player,
      cards = Object.values(p.upgrades).reduce((a, b) => a + b, 0);
    if (this.initialized) {
      if (p.hp > this.hp + 0.3) this.add(p, "heal", 85, 0.65);
      if (p.level > this.level) this.add(p, "level", 120, 0.7);
      else if (cards > this.cards) this.add(p, "reward", 85, 0.55);
    }
    this.hp = p.hp;
    this.level = p.level;
    this.cards = cards;
    this.time = s.time;
    this.initialized = true;
  }
}
