import type { WeaponId } from "../../core/types";
import { WEAPONS } from "../weapons";
export interface Upgrade {
  id: string;
  name: string;
  desc: string;
  rarity: 0 | 1 | 2;
  max: number;
  requires?: string;
  excludes?: string;
  weapon?: WeaponId;
}
export const LEGACY_CARDS: Upgrade[] = [
  ...Object.entries(WEAPONS).map(([id, w]) => ({
    id: `weapon_${id}`,
    name: w.name,
    desc: `获得或强化${w.name}。可同时携带全部武器；最高五级。`,
    rarity: 1 as const,
    max: 5,
    weapon: id as WeaponId,
  })),
  {
    id: "fork",
    name: "双生星轨",
    desc: "弓箭额外发射一支；叠加扩大扇形覆盖。",
    rarity: 1,
    max: 3,
    requires: "weapon_bow",
  },
  {
    id: "pierce",
    name: "穿林",
    desc: "弓箭和星火额外穿透一个敌人。",
    rarity: 0,
    max: 3,
    excludes: "split",
  },
  {
    id: "split",
    name: "碎星",
    desc: "弓箭击中后分裂为三束短程碎片。与穿林互斥。",
    rarity: 2,
    max: 1,
    excludes: "pierce",
    requires: "weapon_bow",
  },
  {
    id: "homing",
    name: "引力信标",
    desc: "弓箭、星火和灵体弹道追踪附近敌人。",
    rarity: 2,
    max: 1,
  },
  {
    id: "wide",
    name: "满月",
    desc: "弧月刃半径每级 +18；每次挥砍每级补充 2 护盾（仅补充至80）。",
    rarity: 1,
    max: 3,
    requires: "weapon_blade",
  },
  {
    id: "burn",
    name: "不熄余烬",
    desc: "燃烧持续时间每级 +1 秒；燃烧伤害系数每级 +25%。",
    rarity: 0,
    max: 4,
  },
  {
    id: "wildfire",
    name: "野火蔓延",
    desc: "燃烧中的敌人死亡时，将火种传给周围敌人。",
    rarity: 2,
    max: 1,
    requires: "burn",
  },
  {
    id: "shatter",
    name: "冰火共鸣",
    desc: "冻结或减速敌人受到伤害每级 +30%；火焰不解除冻结。",
    rarity: 2,
    max: 2,
  },
  {
    id: "satellite",
    name: "双月共舞",
    desc: "月环增加一颗卫星，并扩大环绕半径。",
    rarity: 1,
    max: 3,
    requires: "weapon_orbit",
  },
  {
    id: "swarm",
    name: "萤火之森",
    desc: "额外召唤一只灵体，并提高其射击频率。",
    rarity: 1,
    max: 2,
    requires: "weapon_drone",
  },
  {
    id: "skill_q",
    name: "主术精通",
    desc: "Q 技能等级 +1，扩大范围并增强机制。",
    rarity: 1,
    max: 4,
  },
  {
    id: "skill_e",
    name: "辅术精通",
    desc: "E 技能等级 +1，强化治疗、护盾或领域。",
    rarity: 1,
    max: 4,
  },
  {
    id: "skill_r",
    name: "星坠回响",
    desc: "终极技能等级 +1，增加星爆次数。",
    rarity: 2,
    max: 4,
  },
  {
    id: "haste",
    name: "时隙",
    desc: "主动技能冷却缩短 8%，最多缩短 32%。",
    rarity: 1,
    max: 4,
  },
  {
    id: "vitality",
    name: "古树之心",
    desc: "最大生命 +25，同时恢复 35 点生命。",
    rarity: 0,
    max: 5,
  },
  {
    id: "stride",
    name: "轻羽",
    desc: "移动速度 +15；闪避冷却每级缩短 0.2 秒。",
    rarity: 0,
    max: 4,
  },
  {
    id: "critical",
    name: "鹰眼",
    desc: "暴击率 +7%；暴击造成双倍伤害。",
    rarity: 0,
    max: 5,
  },
  {
    id: "renew",
    name: "春芽",
    desc: "每秒回复 0.4 点生命。",
    rarity: 0,
    max: 4,
  },
  {
    id: "magnet",
    name: "拾星",
    desc: "经验吸取半径增加 55。",
    rarity: 0,
    max: 3,
  },
  { id: "power", name: "星核", desc: "所有伤害 +12%。", rarity: 0, max: 5 },
  {
    id: "ascend",
    name: "无垠领悟",
    desc: "无限叠加的对数伤害成长，并回复 15% 生命。",
    rarity: 1,
    max: Number.MAX_SAFE_INTEGER,
  },
];
