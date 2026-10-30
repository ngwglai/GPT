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
export const CHARACTERS = [
  {
    id: "ranger",
    name: "逐星游侠",
    role: "灵巧 · 弹道构筑",
    weapon: "bow" as WeaponId,
    hp: 110,
    speed: 230,
    skill: "fire" as SkillId,
    desc: "穿行于星光之间。弓矢自动锁敌，远距离掌控战场。",
    color: "#a9eccb",
  },
  {
    id: "knight",
    name: "余烬守卫",
    role: "坚韧 · 近战反击",
    weapon: "blade" as WeaponId,
    hp: 155,
    speed: 205,
    skill: "ice" as SkillId,
    desc: "深入怪潮中心。宽幅斩击与额外生命让你从容迎战。",
    color: "#ffc383",
  },
  {
    id: "mage",
    name: "月棘术士",
    role: "奥术 · 持续伤害",
    weapon: "ember" as WeaponId,
    hp: 95,
    speed: 220,
    skill: "lance" as SkillId,
    desc: "让森林燃起星火。法术灼烧与控制创造施法空间。",
    color: "#c9b2ff",
  },
];
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
export const UPGRADES: Upgrade[] = [
  ...Object.entries(WEAPONS).map(([id, w]) => ({
    id: `weapon_${id}`,
    name: w.name,
    desc: `获得或强化${w.name}。最多携带三种武器；五级进化。`,
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
    desc: "弧月刃扩大范围；每次挥砍额外恢复护盾。",
    rarity: 1,
    max: 3,
    requires: "weapon_blade",
  },
  {
    id: "burn",
    name: "不熄余烬",
    desc: "燃烧时间延长，燃烧伤害增加。",
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
    desc: "冻结或减速中的敌人承受额外伤害；火焰不解除冻结。",
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
    desc: "移动速度 +7%，闪避冷却缩短。",
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
