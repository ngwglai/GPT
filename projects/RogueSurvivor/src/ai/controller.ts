import { refresh } from "../core/cardPool";
import { World } from "../core/world";
import type { Input, Vec } from "../core/types";
import { distance, unit } from "../core/math";
import { observe, type Policy, type CardDecision } from "./types";
import { LegacyPolicy } from "./legacy";
import { CombatPolicy, COMBAT_V3 } from "./combat";
import { BuildPolicy, BUILD_V3 } from "./build";
import { copyInput, type SkillEvent } from "./diagnostics";
export type PolicyId = "legacy" | "combat" | "build";
export const POLICY_LABELS: Record<PolicyId, string> = {
  legacy: "Legacy · 原始自动玩家",
  combat: "Combat V3 · 新战斗 / 旧选牌",
  build: "Build V4 · 战斗与构筑",
};
export function createPolicy(id: PolicyId): Policy {
  return id === "legacy"
    ? new LegacyPolicy()
    : id === "combat"
      ? new CombatPolicy(COMBAT_V3)
      : new BuildPolicy(COMBAT_V3, BUILD_V3);
}
export const LOG_LIMITS = { choices: 240, skills: 160 };
export interface ChoiceEvent {
  sequence: number;
  time: number;
  offered: string[];
  chosen: string;
  kind: string;
  refreshed: boolean;
  scores: CardDecision["scores"];
}
/** Capture successful casts at the original public API, after real cooldown/capacity validation. */
export class ObservedWorld extends World {
  onSkill?: (event: Omit<SkillEvent, "sequence">) => void;
  override cast(slot: number, aim: Vec) {
    const p = this.s.player,
      skill = p.skills[slot];
    const origin = { x: p.x, y: p.y },
      requested = { ...aim };
    const result = super.cast(slot, aim);
    if (result) {
      const dx = requested.x - origin.x,
        dy = requested.y - origin.y;
      const direction = unit(dx, dy),
        range = Math.min(450, distance(requested, origin));
      const target = ["ice", "ward", "bloom"].includes(skill)
        ? origin
        : {
            x: origin.x + direction.x * range,
            y: origin.y + direction.y * range,
          };
      this.onSkill?.({ time: this.s.time, skill, slot, target });
    }
    return result;
  }
}
/** Decisions are identical to the headless policies; telemetry is bounded and never feeds back. */
export class AIController {
  private last = -Infinity;
  private cached: Input = { x: 0, y: 0, aim: { x: 0, y: 0 } };
  lastInput?: Input;
  decisions = 0;
  choicesTotal = 0;
  skillsTotal = 0;
  readonly choices: ChoiceEvent[] = [];
  readonly skills: SkillEvent[] = [];
  constructor(readonly policy: Policy) {}
  setDebug(enabled: boolean) {
    this.policy.setDebug?.(enabled);
  }
  input(world: World) {
    if (world.s.time - this.last >= 0.05 - 1e-8) {
      this.cached = this.policy.act(observe(world.s));
      this.lastInput = copyInput(this.cached);
      this.last = world.s.time;
      this.decisions++;
    }
    return this.cached;
  }
  recordSkill(event: Omit<SkillEvent, "sequence">) {
    this.skills.push({ ...event, sequence: ++this.skillsTotal });
    if (this.skills.length > LOG_LIMITS.skills) this.skills.shift();
  }
  manage(world: World) {
    for (let n = 0; n < 32 && world.s.phase === "upgrade"; n++) {
      const d = this.policy.choose(observe(world.s)),
        offered = [...world.s.choices];
      const kind = world.s.deck?.active || "positive";
      const rerolled = d.refresh && refresh(world.s);
      if (!rerolled && !world.choose(d.id))
        throw Error("AI selected an illegal card");
      this.choices.push({
        sequence: ++this.choicesTotal,
        time: world.s.time,
        offered,
        chosen: rerolled ? "refresh" : d.id,
        kind,
        refreshed: rerolled,
        scores: d.scores.map((score) => ({ ...score })),
      });
      if (this.choices.length > LOG_LIMITS.choices) this.choices.shift();
    }
    if (world.s.phase === "revive") world.revive();
  }
}
