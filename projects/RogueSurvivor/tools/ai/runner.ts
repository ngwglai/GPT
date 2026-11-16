import { World } from "../../src/core/world";
import { createRun } from "../../src/core/create";
import { refresh } from "../../src/core/cardPool";
import { validateRun } from "../../src/services/storage";
import { zoneContains } from "../../src/core/attackGeometry";
import { distance } from "../../src/core/math";
import { LegacyPolicy } from "../../src/ai/legacy";
import {
  CombatPolicy,
  COMBAT_V1,
  COMBAT_V2,
  COMBAT_V3,
} from "../../src/ai/combat";
import { BuildPolicy, BUILD_V1, BUILD_V2, BUILD_V3 } from "../../src/ai/build";
import { observe, type Policy } from "../../src/ai/types";
import type { MapId } from "../../src/data/maps";
import type { Mode, Input } from "../../src/core/types";

export const policies: Record<string, () => Policy> = {
  "build-v4": () => new BuildPolicy(COMBAT_V3, BUILD_V3),
  "combat-v3": () => new CombatPolicy(COMBAT_V3),
  "build-v3": () => new BuildPolicy(COMBAT_V3, BUILD_V2),
  "build-v3-sustain": () =>
    new BuildPolicy(COMBAT_V3, { ...BUILD_V2, sustain: 0.55, health: 0.8 }),
  legacy: () => new LegacyPolicy(),
  combat: () => new CombatPolicy(),
  build: () => new BuildPolicy(),
  "combat-v2": () => new CombatPolicy(COMBAT_V2),
  "build-v2": () => new BuildPolicy(COMBAT_V2, BUILD_V2),
  "build-offense": () =>
    new BuildPolicy(COMBAT_V2, { ...BUILD_V2, offense: 1.8, sustain: 0.18 }),
  "build-sustain": () =>
    new BuildPolicy(COMBAT_V2, { ...BUILD_V2, sustain: 0.55, health: 0.8 }),
  "build-v1-v2": () => new BuildPolicy(COMBAT_V1, BUILD_V2),
};
export interface MatchOptions {
  policy: string;
  character: string;
  seed: number;
  map: MapId;
  mode: Mode;
  seconds: number;
  hz?: 20 | 60;
  decisionHz?: 10 | 20;
}
export interface HitRecord {
  time: number;
  amount: number;
  raw: number;
  hp: number;
  x: number;
  y: number;
  category: string;
  evidence: string[];
  enemies: number;
  nearby: number;
  sectors: number;
  bullets: number;
  edge: number;
}
class MeasuredWorld extends World {
  hits: HitRecord[] = [];
  damageTaken = 0;
  override hurt(raw: number) {
    const s = this.s,
      p = s.player,
      before = s.stats.taken;
    const oldHurt = this.poseEvents.hurt;
    super.hurt(raw);
    if (this.poseEvents.hurt === oldHurt) return;
    this.damageTaken += s.stats.taken - before;
    const contacts = s.enemies.filter((e) => distance(e, p) < e.r + 20);
    const bullets = s.bullets.filter(
      (b) => b.enemy && distance(b, p) < b.r + 24 + Math.hypot(b.vx, b.vy) / 20,
    );
    const zones = s.zones.filter(
      (z) => z.enemy && z.delay <= 0 && zoneContains(z, p),
    );
    const stack = new Error().stack || "";
    const category = stack.includes("projectiles")
      ? zones.some((z) => z.damage === raw)
        ? "zone"
        : "bullet"
      : contacts.some((e) => e.damage === raw)
        ? "contact"
        : "environment";
    const sectors = new Set(
      s.enemies
        .filter((e) => distance(e, p) < 190)
        .map((e) =>
          Math.floor(
            ((Math.atan2(e.y - p.y, e.x - p.x) + Math.PI) * 4) / Math.PI,
          ),
        ),
    );
    this.hits.push({
      time: s.time,
      amount: s.stats.taken - before,
      raw,
      hp: p.hp,
      x: p.x,
      y: p.y,
      category,
      evidence: [
        ...contacts.map((e) => `contact:${e.kind}`),
        ...bullets.map((b) => `bullet:${b.source}`),
        ...zones.map((z) => `zone:${z.kind}:${z.source}`),
      ],
      enemies: s.enemies.length,
      nearby: contacts.length,
      sectors: sectors.size,
      bullets: bullets.length,
      edge: Math.min(p.x, p.y, 3600 - p.x, 3600 - p.y),
    });
  }
}
export function runMatch(o: MatchOptions) {
  const start = performance.now(),
    policy = policies[o.policy]?.();
  if (!policy) throw Error(`Unknown policy: ${o.policy}`);
  const w = new MeasuredWorld(
    createRun(
      o.mode,
      o.character,
      o.seed,
      o.character === "knight" ? "ice" : "fire",
      "bloom",
      o.map,
    ),
  );
  const hz = o.hz || 60,
    decisionHz = o.decisionHz || 20;
  const dt = 1 / hz,
    interval = hz / decisionHz;
  let frames = 0,
    decisions = 0,
    decisionMs = 0;
  let input: Input = { x: 0, y: 0, aim: w.s.player };
  const cards: {
    time: number;
    level: number;
    kind: string;
    offered: string[];
    chosen: string;
    refresh: boolean;
    scores: ReturnType<Policy["choose"]>["scores"];
  }[] = [];
  const checkpoints: {
    time: number;
    wave: number;
    level: number;
    hp: number;
    maxHp: number;
    damage: number;
    taken: number;
    kills: number;
    bosses: number;
    enemies: number;
    speed: number;
    attack: number;
    layers: number;
  }[] = [];
  let nextCheckpoint = 60;
  while (
    w.s.time < o.seconds - 1e-8 &&
    !["dead", "victory"].includes(w.s.phase)
  ) {
    if (["dying", "reviving"].includes(w.s.phase)) {
      w.advancePresentation(dt);
      continue;
    }
    if (w.s.phase === "revive") {
      if (!w.revive()) throw Error("revive rejected");
      continue;
    }
    if (w.s.phase === "upgrade") {
      const choice = policy.choose(observe(w.s)),
        offered = [...w.s.choices],
        kind = w.s.deck?.active || "positive";
      const rerolled = choice.refresh && refresh(w.s);
      cards.push({
        time: w.s.time,
        level: w.s.player.level,
        kind,
        offered,
        chosen: rerolled ? "refresh" : choice.id,
        refresh: rerolled,
        scores: choice.scores,
      });
      if (!rerolled && !w.choose(choice.id))
        throw Error(`Illegal choice: ${choice.id}`);
      if (cards.length > 20000) throw Error("choice loop");
      continue;
    }
    if (frames % interval === 0) {
      const t = performance.now();
      input = policy.act(observe(w.s));
      decisionMs += performance.now() - t;
      decisions++;
    }
    w.step(dt, input);
    frames++;
    if (w.s.time >= nextCheckpoint) {
      const s = w.s,
        p = s.player;
      checkpoints.push({
        time: s.time,
        wave: s.wave!.number,
        level: p.level,
        hp: p.hp,
        maxHp: p.maxHp,
        damage: s.stats.damage,
        taken: s.stats.taken,
        kills: s.stats.kills,
        bosses: s.stats.bosses,
        enemies: s.enemies.length,
        speed: p.speed,
        attack: p.attack,
        layers: Object.values(p.upgrades).reduce((n, v) => n + v, 0),
      });
      nextCheckpoint += 60;
    }
    if (frames > Math.ceil(o.seconds * hz) + 2)
      throw Error("nonadvancing match");
  }
  validateRun(structuredClone(w.s));
  const hits = w.hits,
    last = hits.at(-1);
  const dead = w.s.phase === "dead";
  const causes = dead
    ? [
        last?.category || "unknown",
        ...(last && last.sectors >= 5 ? ["surrounded"] : []),
        ...(last && last.edge < 180 ? ["edge-constrained"] : []),
        ...(w.s.enemies.length > 65 ? ["crowd-output-pressure"] : []),
        ...(last && w.s.player.maxHp < last.raw * 3
          ? ["low-effective-health"]
          : []),
      ]
    : [];
  return {
    ...o,
    hz,
    decisionHz,
    seconds: w.s.time,
    limitSeconds: o.seconds,
    phase: w.s.phase,
    censored: w.s.phase === "playing",
    victory: w.s.phase === "victory",
    wave: w.s.wave!.number,
    level: w.s.player.level,
    bosses: w.s.stats.bosses,
    kills: w.s.stats.kills,
    taken: w.s.stats.taken,
    damage: w.s.stats.damage,
    healed: w.s.stats.healed,
    bySource: w.s.stats.bySource,
    revival: w.s.revival,
    cards,
    player: structuredClone(w.s.player),
    checkpoints,
    hits,
    causes,
    finalScene: {
      enemies: w.s.enemies.map((e) => ({
        id: e.id,
        kind: e.kind,
        x: e.x,
        y: e.y,
        hp: e.hp,
        maxHp: e.maxHp,
        speed: e.speed,
        damage: e.damage,
      })),
      hostileBullets: w.s.bullets.filter((b) => b.enemy).length,
      hostileZones: w.s.zones.filter((z) => z.enemy).length,
    },
    telemetry: {
      frames,
      decisions,
      meanDecisionMs: decisionMs / Math.max(1, decisions),
      wallSeconds: (performance.now() - start) / 1000,
    },
  };
}
export type MatchResult = ReturnType<typeof runMatch>;
