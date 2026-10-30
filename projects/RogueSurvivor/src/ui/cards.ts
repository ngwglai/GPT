import { ENEMY_RULES, ENEMY_BEHAVIORS } from "../data/enemies";
import { skillLevelText } from "../data/skills";
import { UPGRADES, RARITIES, WEAPONS, SKILLS, ENEMIES } from "../data/content";
import type { Modifier } from "../data/cards/expedition";
import { MODIFIERS } from "../data/cards/expedition";
import { LEGACY_MODIFIERS } from "../data/cards/effects";
import { recalculate, modifier, soft } from "../core/fate";
import { ensureDeck, heldLayers } from "../core/deckState";
import { detail } from "../data/cards/descriptions";
import type { Run, SkillId, WeaponId, EnemyId } from "../core/types";
const labels: Record<string, string> = {
  maxHp: "最大生命",
  speed: "移动速度",
  attack: "全伤害系数",
  crit: "暴击率",
  regen: "每秒生命回复",
  magnet: "拾取半径",
  cooldown: "主动冷却系数",
};
const fmt = (n: number) => Number(n.toPrecision(5)).toString();
export function effectSummary(s: Run, id: string) {
  const p = s.player,
    n = p.upgrades[id] || 0;
  const m: Modifier | undefined = LEGACY_MODIFIERS[id] || MODIFIERS[id];
  if (m?.stat)
    return `本卡累计基础贡献 ${fmt(n * m.amount!)}；角色当前${labels[m.stat]} ${fmt(p[m.stat])}（含全部卡牌、递减与负面）。`;
  if (m?.source)
    return `${WEAPONS[m.source as WeaponId]?.name || SKILLS[m.source as SkillId]?.name || m.source}伤害倍率 ${fmt(modifier(s, "damage", m.source))}；频率倍率 ${fmt(modifier(s, "interval", m.source))}。全局伤害另计。`;
  if (m?.taken) return `全部卡牌后的承伤倍率 ${fmt(modifier(s, "taken"))}。`;
  if (m?.xp) return `全部卡牌后的经验倍率 ${fmt(modifier(s, "xp"))}。`;
  if (id.startsWith("weapon_"))
    return `当前武器等级 ${p.weapons[id.slice(7) as WeaponId] || 0} / 5；基础装备等级 ${ensureDeck(s).baseWeapons[id.slice(7) as WeaponId] || 0}。`;
  if (id.startsWith("skill_"))
    return `当前技能等级 ${p.skillLevels[p.skills[{ skill_q: 0, skill_e: 1, skill_r: 2 }[id]!]]} / 5。`;
  if (id.startsWith("hex_"))
    return id === "hex_damage"
      ? `伤害除以${fmt(1 + 0.06 * n)}。`
      : id === "hex_regen"
        ? `回复除以${fmt(1 + 0.12 * n)}。`
        : id === "hex_xp"
          ? `经验除以${fmt(1 + 0.08 * n)}。`
          : id === "hex_wither"
            ? `最大生命乘以${fmt(1 - 0.12 * n)}。`
            : id === "hex_lead"
              ? `移速乘以${fmt(1 - 0.08 * n)}。`
              : id === "hex_silence"
                ? `冷却乘以${fmt(1 + 0.1 * n)}。`
                : `承伤乘以${fmt(1 + 0.15 * n)}。`;
  if (id === "fork")
    return `弓箭额外${n}支；当前每次${1 + n + ((p.weapons.bow || 0) >= 5 ? 1 : 0)}支。`;
  if (id === "pierce") return `弓箭、星火和灵体弹道额外穿透${n}次。`;
  if (id === "satellite")
    return `当前${2 + n + ((p.weapons.orbit || 0) >= 5 ? 2 : 0)}颗月环卫星；半径${95 + n * 12}。`;
  if (id === "swarm")
    return `当前每次${2 + n}束灵体弹道；群体攻击频率额外乘以${fmt(1 + n * 0.2)}。`;
  if (id === "specialist")
    return `当前${Object.keys(p.weapons).length}类武器，专精伤害乘区${fmt(1 + 0.3 / Math.max(1, Object.keys(p.weapons).length))}。`;
  if (id.startsWith("chest_"))
    return `已获得本宝箱${n}次；其奖励已分别记录为其他持有卡牌。`;
  if (id === "burn")
    return `持续${fmt(3 + soft(n, 4))}秒；燃烧强度系数 ${fmt(1 + 0.25 * soft(n, 4))}。`;
  if (id === "wide")
    return `斩击半径+${fmt(Math.min(240, n * 18))}；每次挥砍补盾${fmt(Math.min(40, n * 2))}（仅补至80）。超过半径上限的层数转化伤害。`;
  if (id === "shatter")
    return `对冻结/减速敌人伤害乘以${fmt(1 + 0.3 * soft(n, 2))}。`;
  if (id === "reroll") return `当前剩余刷新 ${ensureDeck(s).refreshes} 次。`;
  if (id === "ascend") return `领悟伤害乘区 ${fmt(1 + 0.23 * Math.log1p(n))}。`;
  return `持有${n}层；${UPGRADES.find((u) => u.id === id)!.desc}`;
}
export function nextEffect(s: Run, id: string) {
  const u = UPGRADES.find((u) => u.id === id)!;
  if (
    !u.effects.stat &&
    !u.effects.damage &&
    !u.effects.interval &&
    !u.effects.xp &&
    !u.effects.taken &&
    !["burn", "wide", "shatter"].includes(id)
  )
    return "";
  const draft = {
    ...s,
    player: structuredClone(s.player),
    fate: s.fate && structuredClone(s.fate),
    deck: s.deck && structuredClone(s.deck),
  };
  ensureDeck(draft);
  draft.player.upgrades[id] = (draft.player.upgrades[id] || 0) + 1;
  recalculate(draft);
  return `当前：${effectSummary(s, id)} 下一层：${effectSummary(draft, id)}`;
}
export function cardBrowser(s: Run, owned = false) {
  ensureDeck(s);
  const cards = UPGRADES.filter(
    (u) => !owned || (s.player.upgrades[u.id] || 0) > 0,
  );
  return `<p>${owned ? `当前持有${heldLayers(s)}层、${cards.length}种卡牌。初始装备为基础状态，单独保留。` : `全部${UPGRADES.length}种卡牌；数值卡无限，机制卡有限。`}</p>${
    owned
      ? `<p>基础装备：${Object.entries(ensureDeck(s).baseWeapons)
          .map(([id, lv]) => `${WEAPONS[id as WeaponId].name} Lv.${lv}`)
          .join(
            "、",
          )}；基础技能：${s.player.skills.map((id) => `${SKILLS[id].name} Lv.${ensureDeck(s).baseSkills[id]}`).join("、")}。</p><p>当前最大生命 ${fmt(s.player.maxHp)} · 伤害系数 ${fmt(s.player.attack)} · 暴击 ${fmt(s.player.crit * 100)}% · 移速 ${fmt(s.player.speed)} · 每秒回复 ${fmt(s.player.regen)} · 冷却系数 ${fmt(s.player.cooldown)}</p>`
      : ""
  }<label>搜索卡牌<input id="card-search" placeholder="输入名称、类型或效果"></label><div class="codex-grid">${cards.map((u) => `<article class="codex-card polarity-${u.polarity}" data-search="${u.name} ${u.type} ${u.desc}"><small>${u.type} · ${RARITIES[u.rarity]} · ${u.polarity === "negative" ? "纯负面" : u.polarity === "mixed" ? "混合风险" : "纯正面"}</small><h3>${u.name} ${owned ? `×${s.player.upgrades[u.id]}` : ""}</h3><p>单层：${u.desc}</p>${owned ? `<p>${effectSummary(s, u.id)}</p>` : ""}<small>上限 ${u.maxStacks === null ? "∞" : u.maxStacks}；角色等级≥${u.conditions.minLevel}；${u.requires ? "前置 " + (UPGRADES.find((x) => x.id === u.requires)?.name || u.requires) : "无前置"}；${u.excludes ? "互斥 " + UPGRADES.find((x) => x.id === u.excludes)?.name : "无互斥"}；${u.cleanseable ? "可净化" : u.forgettable ? "可遗忘" : "不适用净化/遗忘"}${u.effects.source ? "；需装备对应武器/技能" : ""}；洗牌替换池：${u.shuffleReward ? "是" : "否"}</small></article>`).join("")}</div>`;
}
export function enemyBrowser(img: (id: string) => string) {
  return `<p>显示基础数值；实战随时间变化。精英：生命×${ENEMY_RULES.elite.hp}、伤害×${ENEMY_RULES.elite.damage}、速度×${ENEMY_RULES.elite.speed}、体型×${ENEMY_RULES.elite.r}，经验×${ENEMY_RULES.elite.xp}。首领生命低于${ENEMY_RULES.bossPhaseHp * 100}%进入强化阶段。岩甲承伤系数${ENEMY_RULES.guardDamageFactor}。</p><div class="codex-grid">${Object.entries(
    ENEMIES,
  )
    .map(
      ([id, e]) =>
        `<article class="codex-card">${img("enemy." + id)}<small>${e.boss ? "阶段首领 / 无尽循环首领" : "普通 / 精英"}</small><h3>${e.name}</h3><p>基础生命${e.hp}；伤害${e.damage}；速度${e.speed}；碰撞半径${e.r}；经验${e.xp}。</p><p>${ENEMY_BEHAVIORS[id as EnemyId]}</p></article>`,
    )
    .join("")}</div>`;
}

export function skillBrowser(s: Run, img: (id: string) => string) {
  const weapons = Object.entries(WEAPONS)
    .map(
      ([id, w]) =>
        `<article class="codex-card">${img("weapon." + id)}<h3>${w.name} · 自动</h3><p>${w.desc}</p><p>基础伤害${w.damage}；间隔${w.interval}秒；范围${w.range}。</p><p>${detail(s, "weapon_" + id)}</p></article>`,
    )
    .join("");
  const skills = Object.entries(SKILLS)
    .map(
      ([id, w]) =>
        `<article class="codex-card">${img("skill." + id)}<h3>${w.name} · 手动</h3><p>${w.desc}</p><p>基础冷却${w.cooldown}秒；${{ direction: "鼠标方向", area: "鼠标区域", self: "自身中心" }[w.aim]}；最高5级。</p><p>${[1, 2, 3, 4, 5].map((lv) => skillLevelText(id as SkillId, lv)).join("<br>")}</p></article>`,
    )
    .join("");
  return `<div class="codex-grid">${weapons}${skills}</div>`;
}
