import type { Run } from "./types";
import { ensureDeck, heldLayers } from "./deckState";
import { eligible } from "./cardPool";
import { recalculate, fate, report } from "./fate";
import { random } from "./math";
import { CHARACTERS } from "../data/characters";
import { SKILLS } from "../data/skills";
import type { CardDefinition } from "../data/cards/registry";
export const SHUFFLE_RANDOM_BUDGET = 256;
export function shuffleDeck(
  s: Run,
  select?: (pool: CardDefinition[], draft: Run) => string,
  includeSelf = false,
) {
  // No random state, resources or gameplay changes escape the draft until successful commit.
  const draft = structuredClone(s),
    d = ensureDeck(draft),
    p = draft.player,
    f = fate(draft);
  if (includeSelf) p.upgrades.shuffle = (p.upgrades.shuffle || 0) + 1;
  const count = heldLayers(draft);
  if (!Number.isSafeInteger(count) || count < 1 || count > 1e12) return false;
  try {
    const hpRatio = p.hp / p.maxHp;
    p.upgrades = {};
    f.curses = {};
    f.history = [];
    if (!Object.values(d.baseWeapons).some(Boolean)) {
      const c = CHARACTERS.find((c) => c.id === s.character)!;
      d.baseWeapons[c.weapon] = 1;
    }
    recalculate(draft);
    for (let i = 0; i < Math.min(count, SHUFFLE_RANDOM_BUDGET); i++) {
      const pool = eligible(draft).filter(
        (u) => u.polarity === "positive" && u.shuffleReward,
      );
      if (!pool.length) throw Error("没有合法的洗牌候选");
      const id = select
        ? select(pool, draft)
        : pool[Math.floor(random(draft) * pool.length)].id;
      if (!pool.some((u) => u.id === id)) throw Error("非法洗牌候选");
      p.upgrades[id] = (p.upgrades[id] || 0) + 1;
      f.history = f.history.filter((x) => x !== id);
      f.history.push(id);
      recalculate(draft);
    }
    const rest = count - SHUFFLE_RANDOM_BUDGET;
    if (rest > 0) {
      const pool = eligible(draft).filter(
        (u) =>
          u.polarity === "positive" && u.shuffleReward && u.maxStacks === null,
      );
      if (!pool.length) throw Error("没有合法的无限数值奖励");
      const weights = pool.map(() => 0.25 + random(draft)),
        total = weights.reduce((a, b) => a + b, 0);
      let left = rest;
      for (let i = 0; i < pool.length; i++) {
        const amount = Math.min(left, Math.floor((rest * weights[i]) / total));
        if (amount) {
          p.upgrades[pool[i].id] = (p.upgrades[pool[i].id] || 0) + amount;
          f.history = f.history.filter((id) => id !== pool[i].id);
          f.history.push(pool[i].id);
          left -= amount;
        }
      }
      if (left) {
        const id = pool[Math.floor(random(draft) * pool.length)].id;
        p.upgrades[id] = (p.upgrades[id] || 0) + left;
        f.history = f.history.filter((x) => x !== id);
        f.history.push(id);
      }
      recalculate(draft);
    }
    if (heldLayers(draft) !== count || !Object.values(p.weapons).some(Boolean))
      throw Error("洗牌数量或装备校验失败");
    p.hp = Math.min(p.maxHp, Math.max(p.hp > 0 ? 1 : 0, p.maxHp * hpRatio));
    p.shield = 0;
    p.dash = 0;
    p.invincible = 0.3;
    p.weaponTimers = { bow: 0, blade: 0, ember: 0, orbit: 0, drone: 0 };
    p.cooldowns = p.skills.map((id, i) =>
      Math.max(p.cooldowns[i], SKILLS[id].cooldown * p.cooldown),
    );
    p.dashCd = Math.max(
      p.dashCd,
      Math.max(1.3, 2.7 - (p.upgrades.stride || 0) * 0.2),
    );
    d.lastShuffle = { removed: count, added: count };
    report(draft, `命运洗牌：${count}层已等量重构为纯正面卡牌`);
    s.player = p;
    s.fate = f;
    s.deck = d;
    s.rng = draft.rng;
    recalculate(s);
    for (const e of s.enemies) {
      e.burn = 0;
      e.burnPower = 0;
      e.burnSource = "";
      e.freeze = 0;
      e.slow = 0;
    }
    s.bullets = s.bullets.filter((b) => b.enemy);
    s.zones = s.zones.filter((z) => z.enemy);
    return true;
  } catch {
    return false;
  }
}
