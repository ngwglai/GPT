import { buildState } from "./buildState";
import { ensureDeck } from "./deckState";
import { detail } from "../data/cards/descriptions";
import { UPGRADES, xpNeeded } from "../data/content";
import type { Run } from "./types";
import { eligible, offer } from "./cardPool";
import { grant } from "./rewards";
export { eligible, offer } from "./cardPool";
export { grant } from "./rewards";
export function applyUpgrade(s: Run, id: string) {
  if (s.phase !== "upgrade" || !s.choices.includes(id)) return false;
  const u = eligible(s, ensureDeck(s).active || "positive").find(
    (u) => u.id === id,
  );
  if (!u) return false;
  if (!grant(s, id)) return false;
  if (id === "forget") {
    const draws = buildState(s).draws;
    draws.replacement = Math.min(1e12, draws.replacement + 1);
    offer(s, ["reroll", "forget"]);
    return true;
  }
  ensureDeck(s).active = null;
  s.choices = [];
  s.phase = "playing";
  checkLevel(s);
  return true;
}
export function checkLevel(s: Run) {
  const p = s.player,
    d = ensureDeck(s);
  if (s.phase === "playing")
    for (const kind of ["negative", "positive"] as const)
      if (d.pending[kind] > 0) {
        d.pending[kind]--;
        buildState(s).draws[kind] = Math.min(
          1e12,
          buildState(s).draws[kind] + 1,
        );
        offer(s, [], kind);
        return;
      }
  if (p.xp >= xpNeeded(p.level) && s.phase === "playing") {
    p.xp -= xpNeeded(p.level);
    p.level++;
    buildState(s).draws.level = Math.min(1e12, buildState(s).draws.level + 1);
    p.hp = Math.min(p.maxHp, p.hp + 8);
    offer(s);
  }
}
export function damageMultiplier(s: Run) {
  return s.player.attack;
}
export function cardDescription(s: Run, id: string) {
  const u = UPGRADES.find((u) => u.id === id)!;
  const n = u.weapon
    ? s.player.weapons[u.weapon] || 0
    : s.player.upgrades[id] || 0;
  const requires = [u.requires, ...(u.allOf || [])]
    .filter(Boolean)
    .map((key) => UPGRADES.find((x) => x.id === key)?.name || key)
    .join("、");
  const constraints = `${requires ? "前置：" + requires + "。" : ""}${u.excludes ? "互斥：" + (UPGRADES.find((x) => x.id === u.excludes)?.name || u.excludes) + "。" : ""}`;
  return `${u.desc} ${constraints} ${detail(s, id)} 当前${n}级 → ${Math.min(u.max, n + 1)}级，上限${u.maxStacks === null ? "无限" : u.max}级。`;
}
