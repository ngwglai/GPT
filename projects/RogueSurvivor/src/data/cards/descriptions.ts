import { WEAPONS } from "../weapons";
import type { WeaponId } from "../../core/types";
import type { Run } from "../../core/types";
import { MODIFIERS } from "./expedition";
import { LEGACY_MODIFIERS } from "../../core/fate";
const exact: Record<string, string> = {
  fork: "每级弓箭数量 +1；箭之间夹角0.14弧度。",
  pierce: "每级弓箭、星火、灵体弹道额外穿透1次；与碎星互斥。",
  homing: "弓箭、星火、灵体弹道追踪附近敌人；永久。",
  satellite: "每级月环卫星 +1，环绕半径 +12。",
  swarm: "每级灵体弹道 +1，射击频率系数 +20%（加算）。",
  wildfire: "燃烧敌人死亡时，145半径内敌人获得相同强度的火种。",
  power: "所有伤害系数每级 +0.12（同类加算）。",
  ascend:
    "每级回复15%最大生命；伤害乘区为1+0.23×ln(1+领悟等级)。25级起出现，无限叠加。",
};
export function detail(s: Run, id: string) {
  if (id.startsWith("weapon_")) {
    const key = id.slice(7) as WeaponId,
      w = WEAPONS[key],
      lv = s.player.weapons[key] || 0;
    const stat = (n: number) =>
      n
        ? `基础单次伤害${(w.damage * (1 + (n - 1) * 0.3)).toFixed(1)}，基础间隔${(w.interval / (1 + (n - 1) * 0.08)).toFixed(2)}秒`
        : "尚未持有";
    const evolution = {
      bow: "5级额外1箭",
      blade: "5级横扫半径额外+35",
      ember: "命中爆炸并燃烧，5级爆炸半径55→90",
      orbit: "5级额外2颗卫星",
      drone: "5级弹道自动追踪",
    };
    return `${stat(lv)} → ${stat(Math.min(5, lv + 1))}；锁敌/基础范围${w.range}；${evolution[key]}。伤害、频率还受其他卡牌影响。`;
  }

  const n = s.player.upgrades[id] || 0,
    m = MODIFIERS[id] || LEGACY_MODIFIERS[id];
  if (m?.stat) {
    const value = m.amount!;
    const percent = ["attack", "crit", "cooldown"].includes(m.stat);
    const fmt = (x: number) =>
      percent ? `${(x * 100).toFixed(0)}个百分点` : x.toFixed(2);
    return `本卡累计：${fmt(n * value)} → ${fmt((n + 1) * value)}；本次${fmt(value)}。属性上限：暴击75%、移速500、冷却系数最低0.35。`;
  }
  if (id.startsWith("skill_")) {
    const slot = { skill_q: 0, skill_e: 1, skill_r: 2 }[id]!;
    const skill = s.player.skills[slot],
      lv = s.player.skillLevels[skill];
    const formulas: Record<string, (v: number) => string> = {
      fire: (v) =>
        `基础区域半径${105 + v * 12}，每跳伤害${90 + v * 20}，持续${(1 + v * 0.35).toFixed(2)}秒；3级额外两片半径70/伤害65区域`,
      ice: (v) =>
        `冻结半径${145 + v * 15}，瞬伤${40 + v * 10}，冻结1.2秒；伤害12的冰域持续${2 + v * 0.5}秒`,
      lance: (v) => `伤害${85 + v * 25}，半径${10 + v * 2}，穿透25；3级变为3束`,
      ward: (v) =>
        `护盾+${40 + v * 15}（总上限200），无敌${1 + v * 0.2}秒，震退半径${125 + v * 12}/伤害${35 + v * 12}`,
      bloom: (v) =>
        `立即治疗${20 + v * 12}，花园半径${110 + v * 10}/每跳伤害${16 + v * 6}/持续${4 + v}秒`,
      storm: (v) =>
        `${5 + v * 2}次星爆，每次半径130/伤害${135 + v * 25}；清除敌方弹道`,
    };
    return `技能等级${lv} → ${lv + 1}。当前：${formulas[skill](lv)}。升级后：${formulas[skill](lv + 1)}。伤害受全局加成，领域每0.5秒结算。`;
  }
  return exact[id] || "";
}
