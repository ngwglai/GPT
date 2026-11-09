import type { Enemy, Run, Vec } from "./types";
import { modifier, soft } from "./fate";
import { temporary } from "./environment";
import { frontalFactor } from "./targeting";
import { ENEMIES, ENEMY_RULES } from "../data/enemies";
import { GROWTH_RULES } from "../data/growth";
import { CORE_PARAMS as P } from "../data/cards/cores";
import { buildState } from "./buildState";
export interface DamageContext {
  kind?: "hit" | "burn" | "proc";
  credit?: string;
}
export function criticalMultiplier(
  s: Run,
  kind: "hit" | "burn" | "proc" = "hit",
  charged = false,
) {
  const added = soft(
    (s.player.upgrades.crit_damage || 0) * GROWTH_RULES.critDamageStep,
    2,
  );
  return kind === "proc"
    ? 1
    : kind === "burn"
      ? Math.min(
          GROWTH_RULES.burnCritLimit,
          P.burnCrit + added * GROWTH_RULES.burnCritShare,
        )
      : Math.min(
          GROWTH_RULES.critDamageMax,
          GROWTH_RULES.critBase + added + (charged ? P.huntBonus : 0),
        );
}
/** Every attack carries raw damage; global/expertise/condition/crit each apply once at impact. */
export function damageBreakdown(
  s: Run,
  e: Enemy,
  raw: number,
  source: string,
  critical = false,
  origin?: Vec,
  context: DamageContext = {},
  charged = false,
) {
  const u = s.player.upgrades,
    kind = context.kind || "hit",
    b = buildState(s);
  let condition = 0;
  if (e.freeze > 0 || e.slow > 0)
    condition += soft(u.shatter || 0, 2) * GROWTH_RULES.frozenStep;
  if (e.burn > 0)
    condition += (u.burning_judge || 0) * GROWTH_RULES.conditionStep;
  if (ENEMIES[e.kind].boss)
    condition += (u.boss_hunter || 0) * GROWTH_RULES.conditionStep;
  if (u.execution && e.hp / e.maxHp < 0.25) condition += 0.4;
  if (u.final_judgment && e.hp / e.maxHp < P.judgment.threshold)
    condition += P.judgment.bonus * (1 - e.hp / e.maxHp / P.judgment.threshold);
  if (kind === "hit" && u.star_focus && b.focusId === e.id)
    condition += Math.min(P.focus.hits, b.focusHits) * P.focus.step;
  if (kind === "hit" && u.glass_comet && s.time < b.dashUntil)
    condition += P.comet.bonus;
  const base = Math.max(0, s.player.attack),
    expertise =
      modifier(s, "damage", source) +
      (u.specialist
        ? 0.3 / Math.max(1, Object.keys(s.player.weapons).length)
        : 0),
    conditional = 1 + soft(condition, 2),
    crit = critical ? criticalMultiplier(s, kind, charged) : 1,
    special =
      temporary(s, "damage") *
      frontalFactor(e, origin) *
      (e.kind === "guard" ? ENEMY_RULES.guardDamageFactor : 1);
  const result = raw * base * expertise * conditional * crit * special;
  return {
    raw,
    base,
    expertise,
    conditional,
    critical: crit,
    special,
    total: Number.isFinite(result)
      ? Math.min(1e12, Math.max(0, result))
      : result === Infinity
        ? 1e12
        : 0,
  };
}
