import { enemyGrowth } from "./enemyGrowth";
export {
  bossHpMultiplier,
  bossDamageMultiplier,
  bossAttackRate,
  bossAttackInterval,
} from "./enemyGrowth";
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
export { experienceRequired as xpNeeded } from "./growth";
/** Compatibility metadata for pre-wave tools only. The director uses waves.ts.
 * These density milestones are unchanged; they are not enemy attribute growth. */
function legacySpawnRate(time: number) {
  const points = [
    [0, 2],
    [5, 4],
    [10, 6],
    [15, 9],
    [20, 12],
    [30, 18],
    [60, 25],
  ] as const;
  const t = Math.max(0, time / 60);
  for (let i = 1; i < points.length; i++) {
    const [a, x] = points[i - 1],
      [b, y] = points[i];
    if (t <= b) return x + (y - x) * ((t - a) / (b - a));
  }
  return points[points.length - 1][1];
}
export function difficulty(time: number) {
  const m = Math.max(0, time) / 60;
  return {
    ...enemyGrowth(time),
    spawn: 2 / legacySpawnRate(time),
    pack: 2,
    tier: Math.floor(m / 5),
  };
}

export { CHARACTERS } from "./characters";
export { WEAPONS } from "./weapons";
export { SKILLS } from "./skills";
export { ENEMIES } from "./enemies";
export type { Upgrade } from "./cards/legacy";
import { CORE_CARDS } from "./cards/cores";
import { LEGACY_CARDS } from "./cards/legacy";
import { NEW_CARDS } from "./cards/expedition";
import { defineCards, NEGATIVES } from "./cards/registry";
export const UPGRADES = defineCards([
  ...LEGACY_CARDS,
  ...NEW_CARDS,
  ...CORE_CARDS,
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
