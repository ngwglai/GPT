import { WEAPONS } from "../weapons";
import { SKILLS } from "../skills";
import type { Upgrade } from "./legacy";
export type Stat =
  "maxHp" | "speed" | "attack" | "crit" | "regen" | "magnet" | "cooldown";
export interface Modifier {
  stat?: Stat;
  amount?: number;
  source?: string;
  damage?: number;
  interval?: number;
  taken?: number;
  xp?: number;
}
export const MODIFIERS: Record<string, Modifier> = {
  fortress: { stat: "maxHp", amount: 18 },
  march: { stat: "speed", amount: 8 },
  focus: { stat: "crit", amount: 0.04 },
  recovery: { stat: "regen", amount: 0.25 },
  reach: { stat: "magnet", amount: 35 },
  clock: { stat: "cooldown", amount: -0.04 },
  vigor: { stat: "attack", amount: 0.07 },
  bow_power: { source: "bow", damage: 0.18 },
  bow_quick: { source: "bow", interval: 0.12 },
  blade_power: { source: "blade", damage: 0.18 },
  blade_quick: { source: "blade", interval: 0.12 },
  ember_power: { source: "ember", damage: 0.18 },
  ember_quick: { source: "ember", interval: 0.12 },
  orbit_power: { source: "orbit", damage: 0.18 },
  orbit_quick: { source: "orbit", interval: 0.12 },
  drone_power: { source: "drone", damage: 0.18 },
  drone_quick: { source: "drone", interval: 0.12 },
  fire_master: { source: "fire", damage: 0.25 },
  ice_master: { source: "ice", damage: 0.25 },
  lance_master: { source: "lance", damage: 0.25 },
  storm_master: { source: "storm", damage: 0.2 },
  armor: { taken: -0.08 },
  scholar: { xp: 0.12 },
  bloodmoon: { stat: "attack", amount: 0.4 },
  greed: { xp: 0.45 },
};
const names: Record<string, string> = {
  fortress: "磐石体魄",
  march: "旅人步伐",
  focus: "凝神",
  recovery: "生息",
  reach: "星尘引力",
  clock: "时砂",
  vigor: "战意",
  bow_power: "弓弦张力",
  bow_quick: "速射弦",
  blade_power: "重月锋",
  blade_quick: "回旋刃",
  ember_power: "炽热核心",
  ember_quick: "燃素循环",
  orbit_power: "月核增幅",
  orbit_quick: "月轮加速",
  drone_power: "灵体聚能",
  drone_quick: "蜂群节律",
  fire_master: "陨火学派",
  ice_master: "霜潮学派",
  lance_master: "星贯学派",
  storm_master: "终章学派",
  armor: "星纹护甲",
  scholar: "求知者",
  bloodmoon: "血月契约",
  greed: "贪婪之冠",
};
const labels: Record<Stat, string> = {
  maxHp: "最大生命",
  speed: "移动速度",
  attack: "全伤害系数",
  crit: "暴击率",
  regen: "每秒回血",
  magnet: "拾取半径",
  cooldown: "主动技能冷却系数",
};
export function modifierText(m: Modifier) {
  const sourceName =
    Object.entries({ ...WEAPONS, ...SKILLS }).find(
      ([id]) => id === m.source,
    )?.[1].name || m.source;
  const parts: string[] = [];
  if (m.stat)
    parts.push(
      `${labels[m.stat]} ${m.amount! >= 0 ? "+" : ""}${m.stat === "attack" || m.stat === "crit" || m.stat === "cooldown" ? `${Math.round(m.amount! * 100)}个百分点` : m.amount}`,
    );
  if (m.damage)
    parts.push(
      `${sourceName}来源伤害 +${Math.round(m.damage * 100)}%（同类加算）`,
    );
  if (m.interval)
    parts.push(
      `${sourceName}攻击频率 +${Math.round(m.interval * 100)}%（同类加算）`,
    );
  if (m.taken)
    parts.push(`承受伤害 ${Math.round(m.taken * 100)}%（最多减伤60%）`);
  if (m.xp) parts.push(`经验获取 +${Math.round(m.xp * 100)}%`);
  return parts.join("；");
}
export const NEW_CARDS: Upgrade[] = [
  {
    id: "execution",
    name: "残星裁决",
    desc: "对生命低于25%的敌人造成额外40%伤害。永久，不叠加。",
    rarity: 2,
    max: 1,
  },
  {
    id: "harvest",
    name: "生命收割",
    desc: "每击杀一个敌人恢复0.3生命；不超过最大生命。永久，不叠加。",
    rarity: 2,
    max: 1,
  },
  {
    id: "specialist",
    name: "独行之道",
    desc: "全伤害额外乘以1+0.3/已持有武器种类数；一武器+30%，五武器+6%。",
    rarity: 1,
    max: 1,
  },
  ...Object.entries(MODIFIERS).map(([id, m]) => ({
    id,
    name: names[id],
    desc: `每级永久${modifierText(m)}。${id === "bloodmoon" ? "首次及每级附加枯萎诅咒（最大生命 -12%，最多3层）。" : id === "greed" ? "每级附加脆弱诅咒（承伤 +15%，最多3层）。" : ""}`,
    rarity: (id === "bloodmoon" || id === "greed" ? 2 : m.source ? 1 : 0) as
      0 | 1 | 2,
    max: id === "bloodmoon" || id === "greed" ? 1 : 3,
    requires:
      m.source && ["bow", "blade", "ember", "orbit", "drone"].includes(m.source)
        ? `weapon_${m.source}`
        : undefined,
  })),
  {
    id: "chest_common",
    name: "旅途宝箱",
    desc: "立即获得1项寻常强化；无合法目标则恢复20%生命并获得20护盾。",
    rarity: 0,
    max: 3,
  },
  {
    id: "chest_rare",
    name: "星银宝箱",
    desc: "立即获得2项珍稀强化（可含已有武器等级）；逐项检查资格。无目标则恢复20%生命并获得20护盾。",
    rarity: 1,
    max: 3,
  },
  {
    id: "chest_epic",
    name: "星金宝箱",
    desc: "立即获得3项传奇或珍稀强化；无目标则每项恢复20%生命并获得20护盾。",
    rarity: 2,
    max: 2,
  },
  {
    id: "chest_risk",
    name: "禁忌之书",
    desc: "立即获得3项随机常规强化，同时附加1层随机诅咒（各最多3层）。",
    rarity: 2,
    max: 2,
  },
  {
    id: "cleanse",
    name: "净化之光",
    desc: "随机移除1层诅咒；无诅咒则恢复20%生命并获得20护盾。",
    rarity: 1,
    max: 4,
  },
  {
    id: "baptism",
    name: "星辰洗礼",
    desc: "随机移除1层诅咒，并获得1项寻常强化；无诅咒仍有奖励。",
    rarity: 2,
    max: 2,
  },
  {
    id: "reroll",
    name: "命运重铸",
    desc: "不消耗当前升级机会，替换三选一；每局最多3次，本次候选不会再出现重铸。",
    rarity: 1,
    max: 3,
  },
  {
    id: "forget",
    name: "遗忘药剂",
    desc: "移除最近获得且可安全撤销的1级属性强化，重新选择本次升级（排除药剂和重铸）。没有可撤销属性时不会出现。",
    rarity: 1,
    max: 3,
  },
];
