import { UPGRADES, xpNeeded } from "../data/content";
import type { Run, WeaponId } from "./types";
import { random, clamp } from "./math";
export function eligible(s: Run) {
  const p = s.player;
  return UPGRADES.filter(
    (u) =>
      (p.upgrades[u.id] || 0) < u.max &&
      (!u.requires ||
        (u.requires.startsWith("weapon_")
          ? p.weapons[u.requires.slice(7) as WeaponId]
          : p.upgrades[u.requires])) &&
      (!u.excludes || !p.upgrades[u.excludes]) &&
      (!u.weapon || p.weapons[u.weapon] || Object.keys(p.weapons).length < 3) &&
      (u.id !== "ascend" || p.level >= 25),
  );
}
export function offer(s: Run) {
  const pool = eligible(s),
    chosen: string[] = [];
  while (pool.length && chosen.length < 3) {
    const weights = pool.map(
      (u) => [6, 3, 1][u.rarity] * (u.id === "ascend" ? 2 : 1),
    );
    let n = random(s) * weights.reduce((a, b) => a + b, 0),
      i = 0;
    while (i < pool.length - 1 && n >= weights[i]) n -= weights[i++];
    chosen.push(pool.splice(i, 1)[0].id);
  }
  s.choices = chosen;
  s.phase = "upgrade";
}
export function applyUpgrade(s: Run, id: string) {
  if (s.phase !== "upgrade" || !s.choices.includes(id)) return false;
  const u = eligible(s).find((u) => u.id === id);
  if (!u) return false;
  const p = s.player;
  p.upgrades[id] = (p.upgrades[id] || 0) + 1;
  if (u.weapon)
    p.weapons[u.weapon] = Math.min(5, (p.weapons[u.weapon] || 0) + 1);
  if (id === "vitality") {
    p.maxHp += 25;
    p.hp = Math.min(p.maxHp, p.hp + 35);
  }
  if (id === "stride") p.speed += 15;
  if (id === "critical") p.crit = clamp(p.crit + 0.07, 0, 0.75);
  if (id === "renew") p.regen += 0.4;
  if (id === "magnet") p.magnet += 55;
  if (id === "haste") p.cooldown = Math.max(0.5, p.cooldown - 0.08);
  if (id === "power") p.attack += 0.12;
  if (id === "ascend") p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.15);
  if (id.startsWith("skill_")) {
    const slot = { skill_q: 0, skill_e: 1, skill_r: 2 }[id]!;
    p.skillLevels[p.skills[slot]]++;
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
