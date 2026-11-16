import { refresh } from "../core/cardPool";
import type { World } from "../core/world";
import type { Input } from "../core/types";
import { observe, type Policy } from "./types";
import { LegacyPolicy } from "./legacy";
import { CombatPolicy, COMBAT_V3 } from "./combat";
import { BuildPolicy, BUILD_V3 } from "./build";
export type PolicyId = "legacy" | "combat" | "build";
export function createPolicy(id: PolicyId): Policy {
  return id === "legacy"
    ? new LegacyPolicy()
    : id === "combat"
      ? new CombatPolicy(COMBAT_V3)
      : new BuildPolicy(COMBAT_V3, BUILD_V3);
}
/** Adapter owns only decisions; all movement, damage, choices and revival use public World APIs. */
export class AIController {
  private last = -Infinity;
  private cached: Input = { x: 0, y: 0, aim: { x: 0, y: 0 } };
  readonly choices: { time: number; offered: string[]; chosen: string }[] = [];
  constructor(readonly policy: Policy) {}
  input(world: World) {
    if (world.s.time - this.last >= 0.05 - 1e-8) {
      this.cached = this.policy.act(observe(world.s));
      this.last = world.s.time;
    }
    return this.cached;
  }
  manage(world: World) {
    for (let n = 0; n < 32 && world.s.phase === "upgrade"; n++) {
      const d = this.policy.choose(observe(world.s)),
        offered = [...world.s.choices];
      const rerolled = d.refresh && refresh(world.s);
      if (!rerolled && !world.choose(d.id))
        throw Error("AI selected an illegal card");
      this.choices.push({
        time: world.s.time,
        offered,
        chosen: rerolled ? "refresh" : d.id,
      });
    }
    if (world.s.phase === "revive") world.revive();
  }
}
