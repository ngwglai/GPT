import type { EnemyId, SkillId, WeaponId } from "../core/types";
export const ENEMIES: Record<
  EnemyId,
  {
    name: string;
    hp: number;
    speed: number;
    damage: number;
    r: number;
    color: number;
    xp: number;
    boss?: boolean;
  }
> = {
  crawler: {
    name: "苔团",
    hp: 40,
    speed: 66,
    damage: 9,
    r: 17,
    color: 0x8bc99b,
    xp: 5,
  },
  runner: {
    name: "棘狼",
    hp: 29,
    speed: 122,
    damage: 8,
    r: 15,
    color: 0xdbad73,
    xp: 7,
  },
  archer: {
    name: "荧孢",
    hp: 46,
    speed: 55,
    damage: 12,
    r: 19,
    color: 0xbfa5e1,
    xp: 9,
  },
  seer: {
    name: "窥月者",
    hp: 68,
    speed: 48,
    damage: 17,
    r: 21,
    color: 0xf6978b,
    xp: 12,
  },
  shaman: {
    name: "菌巫",
    hp: 105,
    speed: 40,
    damage: 11,
    r: 24,
    color: 0xb4c76e,
    xp: 18,
  },
  guard: {
    name: "岩甲",
    hp: 170,
    speed: 38,
    damage: 18,
    r: 25,
    color: 0x7da1b4,
    xp: 16,
  },
  bomber: {
    name: "爆灯虫",
    hp: 38,
    speed: 91,
    damage: 20,
    r: 16,
    color: 0xffbe68,
    xp: 10,
  },
  warden: {
    name: "古木守望",
    hp: 3000,
    speed: 42,
    damage: 23,
    r: 54,
    color: 0x8acead,
    xp: 220,
    boss: true,
  },
  witch: {
    name: "蚀月女巫",
    hp: 4400,
    speed: 55,
    damage: 21,
    r: 46,
    color: 0xc4a0ed,
    xp: 300,
    boss: true,
  },
  titan: {
    name: "星骸巨像",
    hp: 6500,
    speed: 34,
    damage: 29,
    r: 63,
    color: 0xe6ae75,
    xp: 450,
    boss: true,
  },
};

export const ENEMY_RULES = {
  elite: { hp: 2.4, damage: 1.3, speed: 1.12, r: 1.2, xp: 3 },
  guardDamageFactor: 0.72,
  bossPhaseHp: 0.45,
};
export const ENEMY_BEHAVIORS: Record<EnemyId, string> = {
  crawler: "持续追击并造成接触伤害",
  runner: "停顿预警后朝锁定方向突进",
  archer: "保持距离发射弹道，后期改为扇形多发",
  seer: "预判玩家移动方向，在前方生成范围预警",
  shaman: "保持距离，周期召唤普通追击敌人",
  guard: "缓慢追击并以岩甲减伤",
  bomber: "接近玩家后，周期标记玩家位置造成范围伤害",
  warden: "围绕玩家生成树根范围预警；低血量追加中心打击",
  witch: "旋转环形弹幕；低血量追加玩家落点范围打击",
  titan: "交替蓄力突进与多重陨落预警；低血量增加打击数量",
};
