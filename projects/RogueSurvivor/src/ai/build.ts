import { damageBreakdown, criticalMultiplier } from "../core/damage";
import { recalculate, modifier, soft } from "../core/fate";
import { grant } from "../core/progression";
import { UPGRADES } from "../data/content";
import { WEAPONS, weaponStats } from "../data/weapons";
import { SKILLS, skillStats } from "../data/skills";
import { CORE_PARAMS } from "../data/cards/cores";
import { GROWTH_RULES } from "../data/growth";
import type { Enemy, Run, WeaponId } from "../core/types";
import type { Observation, CardDecision } from "./types";
import { CombatPolicy, COMBAT_V1, type CombatConfig } from "./combat";

export interface BuildConfig {
  offense: number;
  health: number;
  sustain: number;
  mobility: number;
  economy: number;
  fixedContext?: boolean;
}
export const BUILD_V1: BuildConfig = {
  offense: 1.1,
  health: 0.55,
  sustain: 0.35,
  mobility: 0.8,
  economy: 0.3,
};
export const BUILD_V2: BuildConfig = {
  offense: 1.3,
  health: 0.65,
  sustain: 0.3,
  mobility: 1.1,
  economy: 0.35,
};
export const BUILD_V3: BuildConfig = { ...BUILD_V2, fixedContext: true };
/** An isolated, static build calculation. RNG is synthetic and never inspected;
 * stochastic cards use expectations below, never their sampled rewards. */
function model(s: Observation): Run {
  return structuredClone({
    ...s,
    seed: 0,
    rng: 0,
    version: 5,
    spawnTimer: 0,
    nextBoss: 0,
    nextId: 1,
    bossIndex: 0,
    nextEvent: 0,
    event: "",
    eventUntil: 0,
    victoryClaimed: false,
  }) as Run;
}
function dummy(boss: boolean, frozen = false, burned = false): Enemy {
  return {
    id: 0,
    kind: boss ? "titan" : "crawler",
    x: 0,
    y: 0,
    hp: 750,
    maxHp: 1000,
    r: 20,
    speed: 0,
    damage: 0,
    elite: false,
    timer: 0,
    phase: 0,
    slow: frozen ? 1 : 0,
    freeze: frozen ? 1 : 0,
    burn: burned ? 1 : 0,
    burnPower: 0,
    burnSource: "ember",
    hit: 0,
    charge: null,
  };
}
export interface BuildMetrics {
  crowd: number;
  boss: number;
  effectiveHp: number;
  sustain: number;
  speed: number;
  economy: number;
  fixedContext?: boolean;
}
export function buildMetrics(s: Run): BuildMetrics {
  const p = s.player,
    u = p.upgrades;
  const n = (id: string) => u[id] || 0;
  const frozen =
    p.weapons.orbit || n("twin_resonance")
      ? 0.65
      : p.skills[0] === "ice"
        ? 0.3
        : 0;
  const burned = p.weapons.ember || p.skills[0] === "fire" ? 0.65 : 0;
  const hit = (source: string, raw: number, boss: boolean) => {
    let result = 0;
    for (const f of [false, true])
      for (const b of [false, true]) {
        const prob = (f ? frozen : 1 - frozen) * (b ? burned : 1 - burned);
        const e = dummy(boss, f, b);
        // Expected direct hit, using the game's actual four damage buckets.
        result +=
          prob *
          damageBreakdown(s, e, raw, source).total *
          (1 + p.crit * (criticalMultiplier(s) - 1));
      }
    return result;
  };
  let crowd = 0,
    boss = 0;
  for (const [id, level] of Object.entries(p.weapons) as [WeaponId, number][]) {
    const w = weaponStats(id, level);
    let count = 1,
      aoe = 1;
    if (id === "bow") {
      count = 1 + n("fork") * 0.7 + (level >= 3 ? 0.9 : 0);
      aoe = 1 + n("pierce") * 0.6 + n("split") * 1.2;
    }
    if (id === "drone") count = (2 + n("swarm")) * (1 + n("swarm") * 0.2);
    if (id === "ember") aoe = level >= 3 ? 3.4 : 1.9;
    if (id === "blade")
      aoe = 2.2 + Math.min(240, n("wide") * 18) / 80 + (level >= 3 ? 0.6 : 0);
    if (id === "orbit") {
      count = (2 + n("satellite") + (level >= 3 ? 2 : 0)) * 0.32;
      aoe = 2.5;
    }
    const rate = (count / w.interval) * modifier(s, "interval", id);
    const tracking =
      ["bow", "ember", "drone"].includes(id) &&
      (n("homing") || (id === "drone" && level >= 3))
        ? 1.18
        : 1;
    boss += hit(id, w.damage, true) * rate * tracking;
    crowd += hit(id, w.damage, false) * rate * aoe * tracking;
    if (id === "ember") {
      const burnRate =
        (0.5 + n("burn") * 0.15) * (1 + (n("ember_cycle") ? p.crit * 0.4 : 0));
      crowd += hit(id, w.damage * burnRate, false) * (n("wildfire") ? 3 : 1.5);
      boss += hit(id, w.damage * burnRate, true);
    }
  }
  for (const id of p.skills) {
    const a = skillStats(id, p.skillLevels[id]);
    if (id === "bloom" || id === "ward") continue;
    const cd = SKILLS[id].cooldown * p.cooldown;
    const repeats =
      id === "fire"
        ? 2 + (p.skillLevels[id] >= 3 ? 1 : 0)
        : id === "storm"
          ? a.shots * 0.65
          : a.shots;
    crowd +=
      (hit(id, a.damage, false) * repeats * (id === "lance" ? 2 : 3)) / cd;
    boss += (hit(id, a.damage, true) * repeats) / cd;
  }
  // Bounded procs. These are coverage estimates, never recursive damage multiplication.
  if (n("star_chain") && p.weapons.ember)
    crowd +=
      hit("ember", WEAPONS.ember.damage, false) * CORE_PARAMS.chain.chance * 2;
  if (n("crystal_fracture")) crowd += hit("ice", 36, false) * frozen * 3;
  if (n("orbit_resonance") && p.weapons.orbit)
    crowd += (hit("orbit", 22, false) * frozen * 2) / 0.7;
  if (n("frostfire"))
    crowd += (hit("ember", 28, false) * frozen * burned * 3) / 0.8;
  if (n("star_focus")) boss *= 1.2;
  if (n("final_judgment")) boss *= 1.12;
  if (n("blood_hunt")) {
    boss *= 1 + p.crit * 0.1;
    crowd *= 1 + p.crit * 0.12;
  }
  const taken = modifier(s, "taken");
  let sustain = p.regen;
  if (p.weapons.blade)
    sustain +=
      (Math.min(40, n("wide") * 2) /
        weaponStats("blade", p.weapons.blade).interval) *
      modifier(s, "interval", "blade") *
      0.7;
  if (n("harvest")) sustain += 1.2;
  if (p.skills.includes("bloom"))
    sustain +=
      skillStats("bloom", p.skillLevels.bloom).heal /
      (SKILLS.bloom.cooldown * p.cooldown);
  if (p.skills.includes("ward"))
    sustain +=
      (skillStats("ward", p.skillLevels.ward).shield /
        (SKILLS.ward.cooldown * p.cooldown)) *
      0.7;
  return {
    crowd,
    boss,
    effectiveHp: p.maxHp / taken,
    sustain: sustain / taken,
    speed: p.speed,
    economy: modifier(s, "xp") * (1 + Math.min(500, p.magnet) / 300),
  };
}
export function buildValue(m: BuildMetrics, s: Run, c: BuildConfig) {
  const healthUrgency = s.player.hp < s.player.maxHp * 0.4 ? 1.4 : 1;
  const early = s.player.level < 20 ? 1 : 0.45;
  return (
    c.offense * (Math.log1p(m.crowd) * 0.55 + Math.log1p(m.boss) * 0.45) +
    c.health * healthUrgency * Math.log(m.effectiveHp) +
    c.sustain * Math.log1p(m.sustain) +
    c.mobility * Math.log(m.speed) +
    c.economy * early * Math.log(m.economy)
  );
}
const uncertain = new Set([
  "chest_common",
  "chest_rare",
  "chest_epic",
  "chest_risk",
  "shuffle",
  "cleanse",
  "baptism",
]);
export function evaluateCards(s: Observation, config = BUILD_V1): CardDecision {
  const base = model(s),
    value = buildValue(buildMetrics(base), base, config);
  const rank = (id: string): { id: string; score: number; reason: string } => {
    if (uncertain.has(id)) {
      // Conservative expected utility; no grant() of RNG-dependent rewards.
      const scores: Record<string, number> = {
        chest_common: 0.055,
        chest_rare: 0.19,
        chest_epic: 0.31,
        chest_risk: 0.08,
        shuffle: -0.3,
        cleanse: 0.03,
        baptism: 0.13,
      };
      const negatives = Object.entries(base.player.upgrades)
        .filter(([k]) => k.startsWith("hex_"))
        .reduce((sum, [, n]) => sum + n, 0);
      return {
        id,
        score:
          scores[id] +
          (["cleanse", "baptism"].includes(id)
            ? Math.min(0.25, negatives * 0.08)
            : 0),
        reason: "expected-utility-without-sampling",
      };
    }
    if (id === "forget")
      return { id, score: -0.1, reason: "avoid-erasing-active-synergy" };
    const copy = model(s);
    if (!grant(copy, id)) return { id, score: -1e6, reason: "ineligible" };
    recalculate(copy);
    let score =
      buildValue(
        buildMetrics(copy),
        config.fixedContext ? base : copy,
        config,
      ) - value;
    // Immediate healing has extra value when the run cannot afford to wait for regeneration.
    score +=
      (Math.max(0, copy.player.hp - base.player.hp) /
        Math.max(80, base.player.maxHp)) *
      0.28;
    if (id === "reroll") score += 0.045;
    // Prerequisite graph option value; discounts incomplete combinations instead of assuming completion.
    for (const card of UPGRADES) {
      const req = [card.requires, ...(card.allOf || [])].filter(Boolean);
      if (
        !req.includes(id) ||
        base.player.upgrades[card.id] ||
        card.polarity !== "positive"
      )
        continue;
      const satisfied = req.filter((key) =>
        key?.startsWith("weapon_")
          ? copy.player.weapons[key.slice(7) as WeaponId]
          : copy.player.upgrades[key!],
      ).length;
      score += (0.006 * satisfied) / Math.max(1, req.length);
    }
    if (id === "glass_comet") score -= 0.09;
    if (id === "twin_resonance") score += 0.07;
    return {
      id,
      score,
      reason: "marginal-damage-survival-economy+prerequisite-graph",
    };
  };
  const scores = s.choices
    .map(rank)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return {
    id: scores[0]?.id || "",
    refresh: s.deck?.active !== "negative" && (scores[0]?.score || 0) < 0.025,
    scores,
  };
}
export class BuildPolicy extends CombatPolicy {
  override readonly name: string;
  constructor(
    combat: CombatConfig = COMBAT_V1,
    readonly buildConfig = BUILD_V1,
  ) {
    super(combat);
    this.name = buildConfig.fixedContext
      ? "combat-build-v4"
      : combat.nearTerm
        ? "combat-build-v3"
        : combat.horizon === 1.2
          ? "combat-build-v2"
          : "combat-build-v1";
  }
  override choose(s: Observation) {
    return evaluateCards(s, this.buildConfig);
  }
}
