import type { Combat } from "./combat";
import type { Enemy, Run } from "./types";
import { behavior } from "./enemyBehavior";
import { addCandy } from "./environment";
import { bossesDue } from "./waves";
import { distance, random, unit } from "./math";
import { MIMIC_RULES } from "../data/mimics";

/** Shared original activation: same warning, charge and reach; cancel only this mimic. */
export function awakenMimic(c: Combat, e: Enemy) {
  if (e.kind !== "mimic" || e.hp <= 0) return;
  const b = behavior(e);
  if (b.awakened) return;
  b.awakened = true;
  delete b.escapeRemaining;
  e.charge = unit(c.s.player.x - e.x, c.s.player.y - e.y);
  b.warning = 0.7;
  c.effect(e, "warning", 55);
}
export function canStartMimicEscape(s: Run) {
  const w = s.wave;
  return (
    s.environment?.mapId === "garden" &&
    !!w &&
    w.processed >= w.budget &&
    s.bossIndex >= bossesDue(s) &&
    s.enemies.length > 0 &&
    s.enemies.every(
      (e) => e.hp > 0 && e.kind === "mimic" && !e.behavior?.awakened,
    )
  );
}
/** Runs after player hits and death settlement. Removal is never a death event. */
export function tickMimicEscapes(c: Combat, dt: number) {
  const s = c.s;
  if (s.phase !== "playing" || s.environment?.mapId !== "garden") return;
  // Proximity interception also works while frozen and before a final timer tick.
  for (const e of s.enemies)
    if (
      e.kind === "mimic" &&
      !e.behavior?.awakened &&
      (distance(e, s.player) < MIMIC_RULES.wakeRange || e.hp < e.maxHp)
    )
      awakenMimic(c, e);
  const start = canStartMimicEscape(s),
    escaped = new Set<number>();
  for (const e of s.enemies) {
    if (e.kind !== "mimic" || e.hp <= 0 || e.behavior?.awakened) continue;
    const b = behavior(e);
    if (b.escapeRemaining === undefined) {
      if (start)
        b.escapeRemaining =
          MIMIC_RULES.escapeMin +
          random(s) * (MIMIC_RULES.escapeMax - MIMIC_RULES.escapeMin);
      continue;
    }
    b.escapeRemaining = Math.max(0, b.escapeRemaining - dt);
    if (b.escapeRemaining > 0) continue;
    // At the extreme reward cap retain the living mimic, not a lost/duplicate reward.
    // No RNG is consumed while waiting for a slot to expire or be collected.
    if (
      s.environment.candies.filter((x) => x.mimicReward).length >=
      MIMIC_RULES.rewardCapacity
    )
      continue;
    const kinds = MIMIC_RULES.positiveCandies;
    if (!addCandy(s, e, kinds[Math.floor(random(s) * kinds.length)], true))
      continue;
    escaped.add(e.id);
    c.effect(e, "candy", 42, "溜啦！");
  }
  if (escaped.size) {
    s.enemies = s.enemies.filter((e) => !escaped.has(e.id));
    c.grid.rebuild(s.enemies);
  }
}
