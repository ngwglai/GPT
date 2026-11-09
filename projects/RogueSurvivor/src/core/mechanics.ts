import { ENEMIES } from "../data/enemies";
import type { Combat } from "./combat";
import type { Enemy, Vec } from "./types";
import type { DamageContext } from "./damage";
import { CORE_PARAMS as P } from "../data/cards/cores";
import { buildState } from "./buildState";
import { distance, random } from "./math";

function ready(
  c: Combat,
  key:
    "fractureReady" | "orbitReady" | "chainReady" | "steamReady" | "twinReady",
  interval: number,
) {
  const b = buildState(c.s);
  if (c.s.time < b[key]) return false;
  b[key] = Math.min(1e12, c.s.time + interval);
  return true;
}
function pulse(
  c: Combat,
  p: Vec,
  r: number,
  raw: number,
  source: string,
  credit: string,
  visited?: Set<number>,
) {
  c.effect(
    p,
    credit === "crystal_fracture"
      ? "ice"
      : credit === "star_chain"
        ? "fire"
        : "storm",
    r,
  );
  // Proc damage uses raw power and passes through the same multipliers exactly once.
  for (const e of c.grid.nearby(p, r + 64))
    if (e.hp > 0 && !visited?.has(e.id) && distance(p, e) <= r + e.r) {
      visited?.add(e.id);
      c.damage(e, raw, source, false, undefined, { kind: "proc", credit });
    }
}
export function afterHit(
  c: Combat,
  e: Enemy,
  source: string,
  critical: boolean,
  context: DamageContext,
) {
  const s = c.s,
    u = s.player.upgrades,
    b = buildState(s);
  if ((context.kind || "hit") !== "hit") return;
  if (u.star_focus) {
    if (b.focusId !== e.id) {
      b.focusId = e.id;
      b.focusHits = 0;
    }
    b.focusHits = Math.min(P.focus.hits, b.focusHits + 1);
  }
  if (u.blood_hunt && critical && e.hp <= 0) {
    b.hunt = true;
    c.effect(s.player, "critical", 25, "追猎就绪");
  }
  if (u.twin_resonance && source === "bow") {
    b.twinHits = (b.twinHits + 1) % P.twins.every;
    if (!b.twinHits && e.hp > 0 && ready(c, "twinReady", P.twins.cooldown)) {
      e.freeze = Math.max(
        e.freeze,
        ENEMIES[e.kind].boss ? P.twins.bossFreeze : P.twins.freeze,
      );
      e.slow = Math.max(e.slow, P.twins.slow);
      c.effect(e, "ice", 32);
    }
  }
  if (
    u.crystal_fracture &&
    e.hp <= 0 &&
    e.freeze > 0 &&
    ready(c, "fractureReady", P.fracture.cooldown)
  )
    pulse(
      c,
      e,
      P.fracture.radius,
      P.fracture.damage,
      source,
      "crystal_fracture",
    );
  if (
    u.orbit_resonance &&
    source === "orbit" &&
    e.freeze > 0 &&
    ready(c, "orbitReady", P.resonance.cooldown)
  )
    pulse(
      c,
      e,
      P.resonance.radius,
      P.resonance.damage,
      source,
      "orbit_resonance",
    );
  if (
    u.frostfire &&
    e.freeze > 0 &&
    e.burn > 0 &&
    ready(c, "steamReady", P.steam.cooldown)
  )
    pulse(c, e, P.steam.radius, P.steam.damage, source, "frostfire");
}
export function fireChain(
  c: Combat,
  p: Vec,
  raw: number,
  source: string,
  radius = 0,
) {
  const s = c.s;
  if (
    !s.player.upgrades.star_chain ||
    !ready(c, "chainReady", P.chain.cooldown) ||
    random(s) >= P.chain.chance
  )
    return;
  const visited = new Set(
    c.s.enemies.filter((e) => distance(e, p) <= radius + e.r).map((e) => e.id),
  );
  let origin = p;
  for (let i = 0; i < P.chain.count; i++) {
    let next: Enemy | undefined,
      nearest = P.chain.range;
    for (const e of c.grid.nearby(origin, P.chain.range + 64)) {
      const d = distance(e, origin);
      if (e.hp > 0 && !visited.has(e.id) && d < nearest) {
        nearest = d;
        next = e;
      }
    }
    if (!next) break;
    origin = { x: next.x, y: next.y };
    raw *= P.chain.fraction;
    pulse(c, origin, P.chain.radius, raw, source, "star_chain", visited);
  }
}
