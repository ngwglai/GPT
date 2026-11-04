import type { EnemyId, SkillId, WeaponId } from "../core/types";
export const LIMITS = {
  world: 3600,
  enemies: 800,
  bullets: 1200,
  zones: 240,
  gems: 360,
  effects: 200,
  number: 1e12,
};
export const RARITIES = ["寻常", "珍稀", "传奇"];
export function xpNeeded(level: number) {
  return 18 + level * 12 + Math.floor(Math.sqrt(level) * 8);
}
// v1.4.1 extreme-wave progression. Multipliers are relative to base enemy stats.
// Values are continuous between milestones; the 60-minute tier is the floor
// for late endless runs, rather than allowing numerical overflow.
const MILESTONES = [0, 5, 10, 15, 20, 30, 60] as const;
function milestone(time: number, values: readonly number[]) {
  const m = Math.min(60, Math.max(0, time / 60));
  for (let i = 1; i < MILESTONES.length; i++) {
    if (m <= MILESTONES[i]) {
      const amount =
        (m - MILESTONES[i - 1]) / (MILESTONES[i] - MILESTONES[i - 1]);
      return values[i - 1] + (values[i] - values[i - 1]) * amount;
    }
  }
  return values[values.length - 1];
}
export function difficulty(time: number) {
  const m = Math.max(0, time) / 60;
  return {
    hp: milestone(time, [1, 2, 5, 12, 30, 100, 1000]),
    damage: milestone(time, [1, 1.8, 3, 5, 10, 25, 150]),
    attackRate: milestone(time, [1, 1.5, 2, 3, 4, 6, 12]),
    speed: 1 + Math.min(0.6, m * 0.012),
    // Legacy rate metadata for v1.4.2 tools; v1.5 director uses finite waves.
    spawn: 2 / milestone(time, [2, 4, 6, 9, 12, 18, 25]),
    pack: 2,
    elite: milestone(time, [0.03, 0.06, 0.1, 0.16, 0.23, 0.32, 0.48]),
    tier: Math.floor(m / 5),
  };
}
export function bossHpMultiplier(time: number) {
  return milestone(time, [3, 3, 8, 20, 50, 150, 1500]);
}
export function bossDamageMultiplier(time: number) {
  return milestone(time, [2, 2, 4, 8, 15, 40, 250]);
}
export function bossAttackInterval(time: number, secondPhase: boolean) {
  const base = milestone(time, [1.5, 1.5, 1, 0.7, 0.5, 0.35, 0.2]);
  return Math.max(0.16, base * (secondPhase ? 0.8 : 1));
}

export { CHARACTERS } from "./characters";
export { WEAPONS } from "./weapons";
export { SKILLS } from "./skills";
export { ENEMIES } from "./enemies";
export type { Upgrade } from "./cards/legacy";
import { LEGACY_CARDS } from "./cards/legacy";
import { NEW_CARDS } from "./cards/expedition";
import { defineCards, NEGATIVES } from "./cards/registry";
export const UPGRADES = defineCards([
  ...LEGACY_CARDS,
  ...NEW_CARDS,
  ...NEGATIVES,
  {
    id: "shuffle",
    name: "命运洗牌",
    desc: "包括本卡自身在内，清除全部持有卡牌，按总层数等量换成纯正面常驻卡牌；基础装备保留。不生成宝箱、功能卡、混合或负面卡。",
    rarity: 2,
    max: 1e12,
  },
]);
export const GROWTH = {
  maxEquippedWeapons: null as number | null,
  chestWeights: [6, 3, 1],
  maxCurses: 3,
};
