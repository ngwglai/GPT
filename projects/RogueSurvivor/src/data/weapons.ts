import type { EnemyId, SkillId, WeaponId } from "../core/types";
export const WEAPONS: Record<
  WeaponId,
  {
    name: string;
    desc: string;
    damage: number;
    interval: number;
    range: number;
    color: number;
  }
> = {
  bow: {
    name: "追星弓",
    desc: "自动射向最近敌人；多重箭与穿透构筑。",
    damage: 23,
    interval: 0.65,
    range: 600,
    color: 0xb9f2d1,
  },
  blade: {
    name: "弧月刃",
    desc: "周期横扫周围敌人，并将其击退。",
    damage: 46,
    interval: 0.78,
    range: 155,
    color: 0xffd38f,
  },
  ember: {
    name: "烬火杖",
    desc: "发射爆裂星火并留下持续灼烧。",
    damage: 30,
    interval: 1.05,
    range: 530,
    color: 0xff956f,
  },
  orbit: {
    name: "月环",
    desc: "环绕自身的卫星持续触碰伤害、减速。",
    damage: 15,
    interval: 0.4,
    range: 95,
    color: 0xc5b2ff,
  },
  drone: {
    name: "萤火灵",
    desc: "召唤两只跟随灵体，自动射击远处敌人。",
    damage: 15,
    interval: 0.55,
    range: 650,
    color: 0x8edaf5,
  },
};

export function weaponStats(id: WeaponId, level: number) {
  const w = WEAPONS[id];
  return {
    damage: w.damage * (1 + (level - 1) * 0.3),
    interval: w.interval / (1 + (level - 1) * 0.08),
    range: w.range,
  };
}
