import { actionDuration } from "../data/characterAnimations";
import type { Enemy, Run } from "./types";
import { ENEMIES } from "../data/content";
export const REVIVAL_RULES = {
  defeatDuration: actionDuration("defeat"),
  defeatHold: 0.25,
  reviveDuration: actionDuration("revive"),
  health: 0.5,
  invincible: 3,
  clearRadius: 240,
};
export interface RevivalState {
  remaining: number;
  earned: number;
  used: number;
  rewardedBoss: number;
  elapsed: number;
  deaths: number;
}
export function initialRevival(rewardedBoss = 0): RevivalState {
  return {
    remaining: 0,
    earned: 0,
    used: 0,
    rewardedBoss,
    elapsed: 0,
    deaths: 0,
  };
}
/** No retroactive charges. A live scheduled boss can still earn its future reward. */
export function migrateRevival(s: Run) {
  const live = s.enemies.filter(
    (e) => e.hp > 0 && ENEMIES[e.kind]?.boss && e.bossOrdinal !== undefined,
  );
  return initialRevival(
    live.length
      ? Math.min(s.bossIndex, ...live.map((e) => e.bossOrdinal! - 1))
      : s.bossIndex,
  );
}
export const ensureRevival = (s: Run) => (s.revival ??= migrateRevival(s));
export const inPresentation = (s: Run) =>
  ["dying", "revive", "reviving"].includes(s.phase);
export function beginDefeat(s: Run) {
  if (s.phase !== "playing" || s.player.hp > 0) return false;
  const r = ensureRevival(s);
  r.elapsed = 0;
  r.deaths++;
  s.phase = "dying";
  return true;
}
export function rewardBossLife(s: Run, e: Enemy) {
  const r = ensureRevival(s),
    ordinal = e.bossOrdinal;
  if (
    !ENEMIES[e.kind].boss ||
    e.hp > 0 ||
    e.behavior?.rewardless ||
    ordinal === undefined ||
    !Number.isSafeInteger(ordinal) ||
    ordinal <= r.rewardedBoss ||
    ordinal > s.bossIndex
  )
    return false;
  r.rewardedBoss = ordinal;
  r.remaining++;
  r.earned++;
  return true;
}
export function acceptRevival(s: Run) {
  const r = ensureRevival(s);
  if (s.phase !== "revive" || r.remaining < 1) return false;
  // Persist this phase and debit together; resuming reviving never debits again.
  r.remaining--;
  r.used++;
  r.elapsed = 0;
  s.phase = "reviving";
  return true;
}
export function declineRevival(s: Run) {
  if (s.phase !== "revive") return false;
  s.phase = "dead";
  return true;
}
/** Independent presentation clock. World.step never calls this or advances battle time here. */
export function tickRevival(s: Run, dt: number) {
  if (
    !Number.isFinite(dt) ||
    dt <= 0 ||
    !["dying", "reviving"].includes(s.phase)
  )
    return false;
  const r = ensureRevival(s);
  r.elapsed += Math.min(dt, 0.25);
  if (
    s.phase === "dying" &&
    r.elapsed >= REVIVAL_RULES.defeatDuration + REVIVAL_RULES.defeatHold
  ) {
    r.elapsed = REVIVAL_RULES.defeatDuration + REVIVAL_RULES.defeatHold;
    s.phase = r.remaining > 0 ? "revive" : "dead";
    return true;
  }
  if (s.phase === "reviving" && r.elapsed >= REVIVAL_RULES.reviveDuration) {
    s.player.hp = s.player.maxHp * REVIVAL_RULES.health;
    s.player.invincible = REVIVAL_RULES.invincible;
    s.player.dash = 0;
    r.elapsed = 0;
    s.phase = "playing";
    return true;
  }
  return false;
}
