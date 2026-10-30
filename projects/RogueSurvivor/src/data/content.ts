import type { EnemyId, SkillId, WeaponId } from "../core/types";
export const LIMITS = {
  world: 3600,
  enemies: 150,
  bullets: 360,
  zones: 64,
  gems: 180,
  effects: 120,
  number: 1e12,
};
export const RARITIES = ["寻常", "珍稀", "传奇"];
export function xpNeeded(level: number) {
  return 18 + level * 12 + Math.floor(Math.sqrt(level) * 8);
}
export function difficulty(time: number) {
  const m = Math.max(0, time) / 60;
  return {
    hp: 1 + m * 0.07 + Math.log1p(Math.max(0, m - 20)) * 0.55,
    damage: 1 + Math.log1p(m) * 0.23,
    speed: 1 + Math.min(0.6, m * 0.012),
    spawn: Math.max(0.14, 1.15 / (1 + m * 0.15)),
    elite: Math.min(0.38, 0.03 + m * 0.006),
    tier: Math.floor(m / 5),
  };
}

export { CHARACTERS } from "./characters";
export { WEAPONS } from "./weapons";
export { SKILLS } from "./skills";
export { ENEMIES } from "./enemies";
export type { Upgrade } from "./cards/legacy";
import { LEGACY_CARDS } from "./cards/legacy";
import { NEW_CARDS } from "./cards/expedition";
export const UPGRADES = [...LEGACY_CARDS, ...NEW_CARDS];
export const GROWTH = {
  maxEquippedWeapons: null as number | null,
  chestWeights: [6, 3, 1],
  maxCurses: 3,
};
