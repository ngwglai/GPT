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
