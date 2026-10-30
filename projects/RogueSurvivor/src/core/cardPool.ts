import { UPGRADES, GROWTH } from "../data/content";
import type { Run, WeaponId } from "./types";
import { random } from "./math";
import { removable } from "./fate";
export function eligible(s: Run) {
  const p = s.player;
  return UPGRADES.filter(
    (u) =>
      (p.upgrades[u.id] || 0) < u.max &&
      (!u.weapon || (p.weapons[u.weapon] || 0) < 5) &&
      (!u.id.startsWith("skill_") ||
        p.skillLevels[p.skills[{ skill_q: 0, skill_e: 1, skill_r: 2 }[u.id]!]] <
          5) &&
      (!u.requires ||
        (u.requires.startsWith("weapon_")
          ? p.weapons[u.requires.slice(7) as WeaponId]
          : p.upgrades[u.requires])) &&
      (!u.excludes || !p.upgrades[u.excludes]) &&
      (!u.weapon ||
        p.weapons[u.weapon] ||
        GROWTH.maxEquippedWeapons === null ||
        Object.keys(p.weapons).length < GROWTH.maxEquippedWeapons) &&
      (u.id !== "ascend" || p.level >= 25) &&
      (u.id !== "forget" || !!removable(s)),
  );
}
export function offer(s: Run, exclude: string[] = []) {
  const pool = eligible(s).filter((u) => !exclude.includes(u.id)),
    chosen: string[] = [];
  while (pool.length && chosen.length < 3) {
    const weights = pool.map(
      (u) =>
        [6, 3, 1][u.rarity] *
        (u.id === "ascend" ? 2 : 1) *
        (s.player.level < 20 &&
        (["vitality", "renew", "power"].includes(u.id) || u.weapon)
          ? 4
          : 1),
    );
    let n = random(s) * weights.reduce((a, b) => a + b, 0),
      i = 0;
    while (i < pool.length - 1 && n >= weights[i]) n -= weights[i++];
    chosen.push(pool.splice(i, 1)[0].id);
  }
  s.choices = chosen;
  s.phase = "upgrade";
}
