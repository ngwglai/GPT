import type { EnemyId, SkillId, WeaponId } from "../core/types";
export const SKILLS: Record<
  SkillId,
  {
    name: string;
    desc: string;
    cooldown: number;
    color: number;
    aim: "direction" | "area" | "self";
  }
> = {
  fire: {
    name: "陨火",
    desc: "鼠标位置落下陨火，爆炸并燃烧敌人。",
    cooldown: 7,
    color: 0xff9d73,
    aim: "area",
  },
  ice: {
    name: "霜潮",
    desc: "以自身为中心冻结敌人，再留下减速领域。",
    cooldown: 9,
    color: 0x8cdbff,
    aim: "self",
  },
  lance: {
    name: "星贯",
    desc: "向鼠标方向发射高速贯穿光矛。",
    cooldown: 5,
    color: 0xd6c1ff,
    aim: "direction",
  },
  ward: {
    name: "星幕",
    desc: "获得护盾与短暂无敌，震退周围敌人。",
    cooldown: 13,
    color: 0xb4f5dc,
    aim: "self",
  },
  bloom: {
    name: "复苏",
    desc: "恢复生命；在脚下留下治疗与伤敌的花园。",
    cooldown: 17,
    color: 0xc0f59f,
    aim: "self",
  },
  storm: {
    name: "星落终章",
    desc: "大范围连环星爆，清除敌方弹幕。",
    cooldown: 36,
    color: 0xffdf9b,
    aim: "area",
  },
};

// Numeric level parameters are shared by combat and the codex.
export function skillStats(id: SkillId, level: number) {
  const v = Math.min(5, Math.max(1, level));
  return {
    radius: {
      fire: 105 + v * 12,
      ice: 145 + v * 15,
      lance: 10 + v * 2,
      ward: 125 + v * 12,
      bloom: 110 + v * 10,
      storm: 130,
    }[id],
    damage: {
      fire: 90 + v * 20,
      ice: 40 + v * 10,
      lance: 85 + v * 25,
      ward: 35 + v * 12,
      bloom: 16 + v * 6,
      storm: 135 + v * 25,
    }[id],
    duration: {
      fire: 1 + v * 0.35,
      ice: 2 + v * 0.5,
      lance: 0.8,
      ward: 1 + v * 0.2,
      bloom: 4 + v,
      storm: 0.25,
    }[id],
    shield: 40 + v * 15,
    heal: 20 + v * 12,
    shots: id === "storm" ? 5 + v * 2 : id === "lance" && v >= 3 ? 3 : 1,
  };
}
export function skillLevelText(id: SkillId, level: number) {
  const a = skillStats(id, level);
  return `Lv.${level}：半径${a.radius}，基础伤害${a.damage}，${id === "ward" ? `护盾+${a.shield}（上限200），无敌${a.duration}秒` : id === "bloom" ? `立即治疗${a.heal}，领域${a.duration}秒` : id === "storm" ? `${a.shots}次星爆，清除弹幕` : id === "lance" ? `${a.shots}束，穿透25，持续${a.duration}秒` : `持续${a.duration.toFixed(2)}秒；${id === "fire" && level >= 3 ? "额外两片半径70/伤害65区域" : id === "ice" ? "冻结1.2秒，冰域每跳伤害12" : ""}`}`;
}
