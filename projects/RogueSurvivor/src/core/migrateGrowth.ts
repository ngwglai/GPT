import type { Run, WeaponId } from "./types";
import { ensureDeck } from "./deckState";
import { buildState } from "./buildState";
import { fate, recalculate } from "./fate";
import { LEGACY_MODIFIERS } from "../data/cards/effects";
import { experienceRequired } from "../data/growth";
import { eligible } from "./cardPool";
const OLD_AMOUNTS: Record<string, number> = {
  vitality: 25,
  stride: 15,
  critical: 0.07,
  renew: 0.4,
  magnet: 55,
  haste: -0.08,
  power: 0.12,
};
const rank = (n: number) => (n <= 1 ? n : n <= 3 ? 2 : 3);
/** Called only after the complete old schema has passed validation. Never consumes RNG. */
export function migrateGrowth(s: Run) {
  if (s.version === 5) return;
  const hadBase = !!s.fate;
  const f = fate(s);
  if (!hadBase)
    for (const [id, m] of Object.entries(LEGACY_MODIFIERS))
      f.base[m.stat] +=
        (s.player.upgrades[id] || 0) * (m.amount - OLD_AMOUNTS[id]);
  const d = ensureDeck(s),
    p = s.player;
  let compensation = 0;
  for (const id of ["bow", "blade", "ember", "orbit", "drone"] as WeaponId[]) {
    const base = d.baseWeapons[id] || 0,
      cards = p.upgrades["weapon_" + id] || 0,
      total = base + cards;
    if (!total) continue;
    const newBase = rank(base),
      newTotal = rank(Math.min(5, total));
    if (newBase) d.baseWeapons[id] = newBase;
    p.upgrades["weapon_" + id] = Math.max(0, newTotal - newBase);
    const folded = Math.max(0, total - newTotal);
    if (folded) {
      p.upgrades[id + "_power"] = (p.upgrades[id + "_power"] || 0) + folded;
      f.history.push(id + "_power");
      compensation += folded;
    }
  }
  // Preserve fractional progress towards the old next level, rather than delete earned XP.
  const oldNeed = 18 + p.level * 12 + Math.floor(Math.sqrt(p.level) * 8);
  // Deferred import is unnecessary: the formula is pure and shared by gameplay.
  p.xp = Math.min(1e12, (p.xp / oldNeed) * experienceRequired(p.level));
  const b = buildState(s);
  b.compensation = compensation;
  s.version = 5;
  recalculate(s);
  if (compensation) {
    f.log = [
      ...f.log,
      `星轨重铸：折叠武器等级，补偿${compensation}层对应武器专精`,
    ].slice(-8);
    f.noticeUntil = s.time + 8;
  }
  if (s.phase === "upgrade") {
    const pool = eligible(s, d.active || "positive").map((u) => u.id);
    s.choices = [
      ...new Set([...s.choices.filter((id) => pool.includes(id)), ...pool]),
    ].slice(0, 3);
  }
}
