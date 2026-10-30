import { UPGRADES, GROWTH } from "../data/content";
import type { Run, WeaponId } from "./types";
import { random } from "./math";
import { removable } from "./fate";
import { ensureDeck, type DrawKind } from "./deckState";
export function eligible(s: Run, kind: DrawKind = "positive") {
  ensureDeck(s);
  const p = s.player;
  return UPGRADES.filter(
    (u) =>
      (kind === "negative"
        ? u.polarity === "negative"
        : u.polarity !== "negative") &&
      (p.upgrades[u.id] || 0) < u.max &&
      (!u.conditions.source ||
        p.skills.includes(u.conditions.source as (typeof p.skills)[number]) ||
        (Object.hasOwn(p.weapons, u.conditions.source) &&
          !!p.weapons[u.conditions.source as WeaponId])) &&
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
      p.level >= u.conditions.minLevel &&
      (u.id !== "reroll" || ensureDeck(s).refreshes <= 1e12 - 3) &&
      (u.id !== "forget" || !!removable(s)),
  );
}
export function offer(
  s: Run,
  exclude: string[] = [],
  kind: DrawKind = ensureDeck(s).active || "positive",
) {
  const d = ensureDeck(s);
  d.active = kind;
  const all = eligible(s, kind),
    fresh = all.filter((u) => !exclude.includes(u.id));
  const pool =
    fresh.length >= 3
      ? fresh
      : [...fresh, ...all.filter((u) => exclude.includes(u.id))];
  const chosen: string[] = [];
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
export function refresh(s: Run) {
  const d = ensureDeck(s);
  if (s.phase !== "upgrade" || d.active === "negative" || d.refreshes < 1)
    return false;
  d.refreshes--;
  offer(s, s.choices);
  return true;
}
