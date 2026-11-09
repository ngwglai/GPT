import { buildState } from "./buildState";
import { GROWTH_RULES } from "../data/growth";
import { CORE_IDS } from "../data/cards/cores";
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
      (!u.weapon || (p.weapons[u.weapon] || 0) < GROWTH_RULES.weaponMax) &&
      (!u.id.startsWith("skill_") ||
        p.skillLevels[p.skills[{ skill_q: 0, skill_e: 1, skill_r: 2 }[u.id]!]] <
          5) &&
      (!u.requires ||
        (u.requires.startsWith("weapon_")
          ? p.weapons[u.requires.slice(7) as WeaponId]
          : p.upgrades[u.requires])) &&
      (!u.allOf ||
        u.allOf.every((id) =>
          id.startsWith("weapon_")
            ? !!p.weapons[id.slice(7) as WeaponId]
            : !!p.upgrades[id],
        )) &&
      (!u.excludes || !p.upgrades[u.excludes]) &&
      !UPGRADES.some((x) => x.excludes === u.id && p.upgrades[x.id]) &&
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
    const weights = pool.map((u) => cardWeight(s, u));
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
  const draws = buildState(s).draws;
  draws.refresh = Math.min(1e12, draws.refresh + 1);
  offer(s, s.choices);
  return true;
}

/** Affinity changes odds, never eligibility or deterministic RNG use. */
export function cardWeight(s: Run, u: (typeof UPGRADES)[number]) {
  const p = s.player;
  let weight = [6, 3, 1][u.rarity];
  if (
    p.level < 12 &&
    (["vitality", "renew", "power"].includes(u.id) || u.weapon)
  )
    weight *= 3;
  if (u.weapon && p.weapons[u.weapon]) weight *= 1.5;
  const source = u.conditions.source;
  if (source && p.weapons[source as WeaponId]) weight *= 1.65;
  const burning = !!(
    p.upgrades.burn ||
    p.upgrades.ember_cycle ||
    p.upgrades.star_chain
  );
  const frozen = !!(
    p.upgrades.shatter ||
    p.upgrades.crystal_fracture ||
    p.upgrades.twin_resonance
  );
  if (
    burning &&
    ["burn", "burning_judge", "ember_cycle", "frostfire", "wildfire"].includes(
      u.id,
    )
  )
    weight *= 1.5;
  if (
    frozen &&
    ["shatter", "crystal_fracture", "orbit_resonance", "frostfire"].includes(
      u.id,
    )
  )
    weight *= 1.5;
  if (CORE_IDS.has(u.id)) weight *= 1.4;
  if (u.id.startsWith("chest_")) weight *= 0.55;
  return weight;
}
