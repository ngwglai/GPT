import { detail } from "../data/cards/descriptions";
import { UPGRADES, xpNeeded } from "../data/content";
import type { Run } from "./types";
import { eligible, offer } from "./cardPool";
import { grant } from "./rewards";
export { eligible, offer } from "./cardPool";
export { grant } from "./rewards";
export function applyUpgrade(s: Run, id: string) {
  if (s.phase !== "upgrade" || !s.choices.includes(id)) return false;
  const u = eligible(s).find((u) => u.id === id);
  if (!u) return false;
  grant(s, id);
  if (id === "reroll" || id === "forget") {
    offer(s, ["reroll", "forget"]);
    return true;
  }
  s.choices = [];
  s.phase = "playing";
  checkLevel(s);
  return true;
}
export function checkLevel(s: Run) {
  const p = s.player;
  if (p.xp >= xpNeeded(p.level) && s.phase === "playing") {
    p.xp -= xpNeeded(p.level);
    p.level++;
    p.hp = Math.min(p.maxHp, p.hp + 8);
    offer(s);
  }
}
export function damageMultiplier(s: Run) {
  return (
    s.player.attack * (1 + Math.log1p(s.player.upgrades.ascend || 0) * 0.23)
  );
}
export function cardDescription(s: Run, id: string) {
  const u = UPGRADES.find((u) => u.id === id)!;
  const n = s.player.upgrades[id] || 0;
  return `${u.desc} ${detail(s, id)} 当前${n}级 → ${Math.min(u.max, n + 1)}级，上限${u.id === "ascend" ? "无限" : u.max}级。`;
}
