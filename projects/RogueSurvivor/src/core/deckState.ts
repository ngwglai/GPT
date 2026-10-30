import type { Run, WeaponId, SkillId } from "./types";
import { CHARACTERS } from "../data/characters";
import { fate } from "./fate";
export type DrawKind = "positive" | "negative";
export interface DeckState {
  schema: 2;
  baseWeapons: Partial<Record<WeaponId, number>>;
  baseSkills: Record<SkillId, number>;
  refreshes: number;
  active: DrawKind | null;
  pending: Record<DrawKind, number>;
  revision: number;
  dropWindow: number;
  dropsInWindow: Record<DrawKind, number>;
  earned: Record<DrawKind, number>;
  lastShuffle?: { removed: number; added: number };
}
export function ensureDeck(s: Run): DeckState {
  if (s.deck) return s.deck;
  const p = s.player,
    f = fate(s),
    c = CHARACTERS.find((x) => x.id === s.character)!;
  // v1 initial weapon rank was recorded as an upgrade. Move that rank to the explicit baseline.
  const initial = "weapon_" + c.weapon;
  if (p.weapons[c.weapon] && (p.upgrades[initial] || 0) > 0)
    p.upgrades[initial]--;
  const baseWeapons: Partial<Record<WeaponId, number>> = {};
  for (const [key, lv] of Object.entries(p.weapons)) {
    const base = lv - (p.upgrades["weapon_" + key] || 0);
    if (base > 0) baseWeapons[key as WeaponId] = base;
  }
  const baseSkills = { ...p.skillLevels };
  for (const [slot, id] of ["skill_q", "skill_e", "skill_r"].entries())
    baseSkills[p.skills[slot]] -= p.upgrades[id] || 0;
  for (const [id, n] of Object.entries(f.curses))
    if (n) p.upgrades["hex_" + id] = (p.upgrades["hex_" + id] || 0) + n;
  f.history = [...new Set([...f.history].reverse())].reverse();
  return (s.deck = {
    schema: 2,
    baseWeapons,
    baseSkills,
    refreshes: 3,
    active: s.phase === "upgrade" ? "positive" : null,
    pending: { positive: 0, negative: 0 },
    revision: 0,
    dropWindow: Math.floor(s.time / 60),
    dropsInWindow: { positive: 0, negative: 0 },
    earned: { positive: 0, negative: 0 },
  });
}
export function heldLayers(s: Run) {
  return Object.values(s.player.upgrades).reduce((a, n) => a + n, 0);
}
