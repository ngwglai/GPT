import { eligible } from "./cardPool";
import {
  fate,
  recalculate,
  LEGACY_MODIFIERS,
  addCurse,
  cleanse,
  CURSES,
  forget,
  report,
} from "./fate";
import { MODIFIERS } from "../data/cards/expedition";
import { UPGRADES, GROWTH } from "../data/content";
import type { Run } from "./types";
import { random } from "./math";
function fallback(s: Run) {
  s.player.hp = Math.min(s.player.maxHp, s.player.hp + s.player.maxHp * 0.2);
  s.player.shield = Math.min(200, s.player.shield + 20);
  return "生命恢复20% / 护盾+20";
}
export function grant(s: Run, id: string): boolean {
  const u = eligible(s).find((u) => u.id === id);
  if (!u) return false;
  const p = s.player;
  const f = fate(s);
  p.upgrades[id] = (p.upgrades[id] || 0) + 1;
  f.history.push(id);
  f.history = f.history.slice(-900);
  if (u.weapon)
    p.weapons[u.weapon] = Math.min(5, (p.weapons[u.weapon] || 0) + 1);
  if (LEGACY_MODIFIERS[id] || MODIFIERS[id]?.stat) recalculate(s);
  if (id === "vitality") p.hp = Math.min(p.maxHp, p.hp + 35);
  if (id === "ascend") p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.15);
  if (id.startsWith("skill_")) {
    const slot = { skill_q: 0, skill_e: 1, skill_r: 2 }[id]!;
    p.skillLevels[p.skills[slot]]++;
  }
  if (id === "bloodmoon") addCurse(s, "wither");
  if (id === "greed") addCurse(s, "frail");
  if (id === "cleanse" || id === "baptism") {
    if (!cleanse(s) && id === "cleanse") fallback(s);
    report(s, "净化完成");
  }
  if (id === "forget") {
    const removed = forget(s);
    report(
      s,
      `遗忘：${UPGRADES.find((u) => u.id === removed)?.name || "无"}，重新选择`,
    );
  }
  if (id.startsWith("chest_") || id === "baptism") {
    if (id.startsWith("chest_")) f.chests++;
    const count =
      id === "chest_common" || id === "baptism"
        ? 1
        : id === "chest_rare"
          ? 2
          : 3;
    const results: string[] = [];
    for (let i = 0; i < count; i++) {
      const pool = eligible(s).filter(
        (u) =>
          !u.id.startsWith("chest_") &&
          ![
            "cleanse",
            "baptism",
            "forget",
            "reroll",
            "ascend",
            "bloodmoon",
            "greed",
          ].includes(u.id) &&
          (id === "chest_common" || id === "baptism"
            ? u.rarity === 0
            : id === "chest_rare"
              ? u.rarity === 1
              : id === "chest_epic"
                ? u.rarity >= 1
                : true),
      );
      const weights = pool.map((u) => GROWTH.chestWeights[u.rarity]);
      let n = random(s) * weights.reduce((a, b) => a + b, 0),
        index = 0;
      while (index < pool.length - 1 && n >= weights[index])
        n -= weights[index++];
      const reward = pool[index];
      if (reward) {
        grant(s, reward.id);
        results.push(reward.name);
      } else results.push(fallback(s));
    }
    if (id === "chest_risk") {
      const pool = (Object.keys(CURSES) as (keyof typeof CURSES)[]).filter(
        (k) => (f.curses[k] || 0) < 3,
      );
      if (pool.length) {
        const c = pool[Math.floor(random(s) * pool.length)];
        addCurse(s, c);
        results.push(CURSES[c].name + "诅咒");
      }
    }
    report(s, u.name + "：" + results.join("、"));
  }
  return true;
}
