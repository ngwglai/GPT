import type { Modifier } from "./expedition";
import type { Upgrade } from "./legacy";
import { MODIFIERS, modifierText } from "./expedition";
import { LEGACY_MODIFIERS } from "./effects";
export const STACK_LIMIT = 1e12;
export const NEGATIVE_PARAMS: Record<
  string,
  { amount: number; mode: "linear" | "divide" }
> = {
  hex_wither: { amount: -0.12, mode: "linear" },
  hex_lead: { amount: -0.08, mode: "linear" },
  hex_frail: { amount: 0.15, mode: "linear" },
  hex_silence: { amount: 0.1, mode: "linear" },
  hex_damage: { amount: 0.06, mode: "divide" },
  hex_regen: { amount: 0.12, mode: "divide" },
  hex_xp: { amount: 0.08, mode: "divide" },
};
export function negativeFactor(id: string, n: number) {
  const p = NEGATIVE_PARAMS[id];
  return p.mode === "divide" ? 1 / (1 + p.amount * n) : 1 + p.amount * n;
}
const negativeNames: Record<string, string> = {
  hex_wither: "枯萎",
  hex_lead: "铅足",
  hex_frail: "脆弱",
  hex_silence: "缄默",
  hex_damage: "黯光",
  hex_regen: "荒芜",
  hex_xp: "迷惘",
};
const negativeTargets: Record<string, string> = {
  hex_wither: "最大生命",
  hex_lead: "移速",
  hex_frail: "承受伤害",
  hex_silence: "主动冷却",
  hex_damage: "全伤害",
  hex_regen: "生命回复",
  hex_xp: "经验获取",
};
export const NEGATIVES: Upgrade[] = Object.entries(NEGATIVE_PARAMS).map(
  ([id, p]) => ({
    id,
    name: negativeNames[id],
    desc:
      p.mode === "divide"
        ? `${negativeTargets[id]}除以1+${p.amount}×层数；可净化，无限叠加。`
        : `${negativeTargets[id]}每层乘区${p.amount > 0 ? "+" : ""}${Math.round(p.amount * 100)}个百分点；最多3层，可净化。`,
    rarity: 0,
    max: p.mode === "divide" ? STACK_LIMIT : 3,
  }),
);
function numericNote(id: string) {
  const m: Modifier | undefined = LEGACY_MODIFIERS[id] || MODIFIERS[id];
  if (m?.stat === "maxHp")
    return (
      "最大生命基础总值超过2000后对数递减。" +
      (id === "vitality" ? "获得时回复35生命。" : "")
    );
  if (m?.stat === "attack") return "基础伤害系数超过3后对数递减。";
  if (m?.stat === "regen") return "基础每秒回复超过10后对数递减。";
  if (m?.stat)
    return (
      (
        {
          crit: "暴击率上限75%。",
          speed: "移速上限500。",
          magnet: "拾取半径上限900。",
          cooldown: "主动冷却基础系数最低0.35。",
        } as Record<string, string>
      )[m.stat] + "超出边界的贡献转化全伤害。"
    );
  if (m?.interval) return "额外攻击频率系数上限3倍；超出贡献转化全伤害。";
  if (m?.taken) return "减伤上限60%，超出贡献转化全伤害。";
  return "同类加成超过+200%后对数递减。";
}
export type Polarity = "positive" | "negative" | "mixed";
export type CardType =
  "属性" | "武器" | "技能" | "机制" | "宝箱" | "功能" | "负面" | "契约";
export interface CardDefinition extends Upgrade {
  conditions: { minLevel: number; source: string };
  type: CardType;
  polarity: Polarity;
  maxStacks: number | null;
  effects: Record<string, string | number>;
  canShuffle: boolean;
  shuffleReward: boolean;
  cleanseable: boolean;
  forgettable: boolean;
}
export function defineCards(raw: Upgrade[]): CardDefinition[] {
  return raw.map((u) => {
    const negative = u.id.startsWith("hex_"),
      mixed = ["bloodmoon", "greed", "chest_risk"].includes(u.id);
    const utility = [
      "reroll",
      "forget",
      "cleanse",
      "baptism",
      "shuffle",
    ].includes(u.id);
    const numeric =
      !!LEGACY_MODIFIERS[u.id] ||
      (!!MODIFIERS[u.id] && !mixed) ||
      ["burn", "shatter", "wide"].includes(u.id);
    const infinite =
      numeric ||
      u.id.startsWith("chest_") ||
      [
        "reroll",
        "shuffle",
        "cleanse",
        "baptism",
        "ascend",
        "hex_damage",
        "hex_regen",
        "hex_xp",
      ].includes(u.id);
    const max = infinite ? STACK_LIMIT : u.max;
    const m: Modifier | undefined = LEGACY_MODIFIERS[u.id] || MODIFIERS[u.id];
    return {
      ...u,
      conditions: {
        minLevel: u.id === "ascend" ? 25 : 1,
        source: m?.source || "",
      },
      max,
      maxStacks: infinite ? null : max,
      name: u.id === "reroll" ? "命运馈赠" : u.name,
      desc:
        u.id === "reroll"
          ? "获得3次独立刷新机会。消耗本次抽卡，不立即刷新；刷新机会可累积。"
          : numeric && m
            ? `每层基础贡献：${modifierText(m)}。${numericNote(u.id)}`
            : u.id === "wide"
              ? "每层斩击半径+18（最多+240），挥砍补盾+2（最多40，仅补至80）；超出半径贡献转化伤害。"
              : u.id === "burn"
                ? "前4层每层燃烧时间+1秒、燃烧系数+25个百分点；其后按4+4×ln(层数/4)计算有效层数。"
                : u.id === "shatter"
                  ? "前2层每层对冻结/减速敌人伤害+30个百分点；其后按2+2×ln(层数/2)计算有效层数。"
                  : u.desc,
      type: negative
        ? "负面"
        : mixed
          ? "契约"
          : u.weapon
            ? "武器"
            : u.id.startsWith("chest_")
              ? "宝箱"
              : utility
                ? "功能"
                : u.id.startsWith("skill_")
                  ? "技能"
                  : numeric
                    ? "属性"
                    : "机制",
      polarity: negative ? "negative" : mixed ? "mixed" : "positive",
      effects: negative
        ? { ...NEGATIVE_PARAMS[u.id] }
        : m
          ? (Object.fromEntries(
              Object.entries(m).filter(([, v]) => v !== undefined),
            ) as Record<string, string | number>)
          : { handler: u.id },
      canShuffle: true,
      shuffleReward:
        !negative && !mixed && !utility && !u.id.startsWith("chest_"),
      cleanseable: negative,
      forgettable: numeric && !mixed,
    };
  });
}
