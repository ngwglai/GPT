import { zoneContains } from "../core/attackGeometry";
import {
  clamp,
  closest,
  distance,
  move,
  segmentDistance,
  unit,
} from "../core/math";
import { ENEMIES, LIMITS } from "../data/content";
import { skillStats } from "../data/skills";
import type { Enemy, Input, Vec, Zone } from "../core/types";
import { LegacyPolicy } from "./legacy";
import type { Observation } from "./types";

export interface CombatConfig {
  directions: number;
  horizon: number;
  inertia: number;
  clearance: number;
  loot: number;
  nearTerm?: boolean;
}
export const COMBAT_V1: CombatConfig = {
  directions: 20,
  horizon: 0.96,
  inertia: 1.5,
  clearance: 40,
  loot: 9,
};
export const COMBAT_V2: CombatConfig = {
  ...COMBAT_V1,
  horizon: 1.2,
  clearance: 55,
  loot: 12,
};
export const COMBAT_V3: CombatConfig = {
  ...COMBAT_V1,
  horizon: 1.35,
  clearance: 45,
  loot: 10,
  nearTerm: true,
};
const samples = 8;
/** Predict only already visible telegraphs. This does not step/copy the World or use its RNG. */
export function predictedZone(z: Readonly<Zone>, t: number): Zone {
  const active = Math.max(0, t - Math.max(0, z.delay));
  return {
    ...z,
    x: z.x + (z.shape?.vx || 0) * active,
    y: z.y + (z.shape?.vy || 0) * active,
    shape: z.shape
      ? { ...z.shape, angle: z.shape.angle + z.shape.omega * active }
      : undefined,
  };
}
export class CombatPolicy extends LegacyPolicy {
  override readonly name: string;
  private previous = new Map<number, { x: number; y: number; time: number }>();
  private heading: Vec = { x: 1, y: 0 };
  private goal: Vec = { x: 1800, y: 1800 };
  private goalUntil = -1;
  constructor(readonly config: CombatConfig = COMBAT_V1) {
    super();
    this.name = config.nearTerm
      ? "combat-v3"
      : config.horizon === 1.2
        ? "combat-v2"
        : "combat-v1";
  }
  override act(s: Observation): Input {
    const p = s.player;
    const speedBuff = s.environment?.buffs || [];
    const speed =
      p.speed *
      (speedBuff.some((b) => b.kind === "speed") ? 1.25 : 1) *
      (speedBuff.some((b) => b.kind === "slow") ? 0.75 : 1);
    const horizon = this.config.horizon;
    const dt = horizon / samples;
    const times = this.config.nearTerm
      ? [0.05, 0.1, 0.2, 0.35, 0.55, 0.8, 1.05, 1.35]
      : Array.from({ length: samples }, (_, i) => (i + 1) * dt);
    const rocks = s.rocks.filter(
      (r) => distance(r, p) < speed * (horizon + 0.54) + r.r + 40,
    ) as Parameters<typeof move>[4];
    const enemies = s.enemies
      .filter((e) => e.hp > 0 && distance(e, p) < 950)
      .map((e) => {
        const last = this.previous.get(e.id),
          elapsed = last ? s.time - last.time : 0;
        let v = unit(p.x - e.x, p.y - e.y);
        let vx = v.x * e.speed,
          vy = v.y * e.speed;
        if (elapsed > 0 && elapsed < 0.4) {
          vx = (e.x - last!.x) / elapsed;
          vy = (e.y - last!.y) / elapsed;
        }
        if (e.freeze > 0 || (e.kind === "mimic" && !e.behavior?.awakened))
          vx = vy = 0;
        const charge = e.dashPattern || e.charge;
        const wait =
          e.dashPattern?.wait ??
          (e.charge ? (e.behavior?.warning ?? e.timer) : 0);
        const chargeDir = e.dashPattern
          ? { x: e.dashPattern.dx, y: e.dashPattern.dy }
          : e.charge;
        return { e, vx, vy, charge, wait, chargeDir };
      });
    this.previous.clear();
    for (const e of s.enemies)
      this.previous.set(e.id, { x: e.x, y: e.y, time: s.time });
    const bullets = s.bullets.filter(
      (b) =>
        b.enemy &&
        b.life > 0 &&
        distance(b, p) < 100 + (speed + Math.hypot(b.vx, b.vy)) * horizon,
    );
    const zones = s.zones.filter(
      (z) => z.enemy && z.life > 0 && z.delay < horizon,
    );
    if (s.time >= this.goalUntil || distance(p, this.goal) < 35) {
      this.goal = {
        x: 1800 + Math.cos(s.time * 0.035) * 750,
        y: 1800 + Math.sin(s.time * 0.035) * 750,
      };
      let best = 0;
      for (const g of [...s.gems, ...(s.rewardDrops || [])]) {
        const d = distance(g, p);
        const value =
          "value" in g ? Math.min(4, 1 + Math.log1p(g.value) * 0.25) : 4;
        const score = value / (70 + d);
        if (d < 900 && score > best) {
          best = score;
          this.goal = g;
        }
      }
      for (const c of s.environment?.candies || []) {
        if (["slow", "weak", "curseHaste", "curseCooldown"].includes(c.kind))
          continue;
        const score =
          (c.kind === "heal" && p.hp < p.maxHp * 0.7 ? 7 : 1.5) /
          (70 + distance(c, p));
        if (distance(c, p) < 650 && score > best) {
          best = score;
          this.goal = c;
        }
      }
      this.goalUntil = s.time + 0.6;
    }
    const dirs = Array.from({ length: this.config.directions }, (_, i) => ({
      x: Math.cos((i * 2 * Math.PI) / this.config.directions),
      y: Math.sin((i * 2 * Math.PI) / this.config.directions),
    }));
    dirs.push({ x: 0, y: 0 }, unit(this.goal.x - p.x, this.goal.y - p.y));
    const traces = Array.from({ length: samples }, (_, step) => {
      const t = times[step],
        dt = t - (times[step - 1] || 0);
      return {
        enemies: enemies.map((item) => {
          const { e } = item;
          let x = e.x + item.vx * t,
            y = e.y + item.vy * t;
          if (item.charge && item.chargeDir) {
            const chargeT = clamp(t - Math.max(0, item.wait), 0, 0.42);
            x = e.x + item.chargeDir.x * e.speed * 4 * chargeT;
            y = e.y + item.chargeDir.y * e.speed * 4 * chargeT;
          }
          return {
            x,
            y,
            r: e.r + 16,
            weight:
              Math.max(0.5, e.damage / 20) * (ENEMIES[e.kind].boss ? 1.3 : 1),
          };
        }),
        bullets: bullets.flatMap((b) => {
          const wait = Math.max(0, b.motion?.wait || 0);
          if (t < wait || t - wait > b.life) return [];
          const active = t - wait,
            beforeT = Math.max(0, active - dt);
          const angle =
            Math.atan2(b.vy, b.vx) + ((b.motion?.turn || 0) * active) / 2;
          const v = Math.hypot(b.vx, b.vy);
          return [
            {
              x: b.x + Math.cos(angle) * v * active,
              y: b.y + Math.sin(angle) * v * active,
              bx: b.x + b.vx * beforeT,
              by: b.y + b.vy * beforeT,
              r: b.r + 16,
              weight: Math.max(0.5, b.damage / 20),
            },
          ];
        }),
        zones: zones
          .filter((z) => t >= z.delay && t <= Math.max(0, z.delay) + z.life)
          .map((z) => predictedZone(z as Zone, t)),
      };
    });
    const evaluate = (dir: Vec, dash: boolean) => {
      const pos = { x: p.x, y: p.y };
      const path = this.debugEnabled ? [{ ...pos }] : [];
      const parts = this.debugEnabled
        ? { enemies: 0, bullets: 0, zones: 0, environment: 0 }
        : undefined;
      let risk = 0,
        early = 0;
      for (let i = 1; i <= samples; i++) {
        const t = times[i - 1],
          dt = t - (times[i - 2] || 0),
          prev = { ...pos };
        const dashSeconds = dash
          ? Math.max(0, Math.min(t, 0.18) - Math.min(t - dt, 0.18))
          : Math.max(0, Math.min(t, p.dash) - Math.min(t - dt, p.dash));
        const d = (dt + dashSeconds * 3) * speed;
        const direction = (this.config.nearTerm ? p.dash > t - dt : p.dash > 0)
          ? { x: p.dx, y: p.dy }
          : dir;
        move(pos, direction.x * d, direction.y * d, 16, rocks);
        if (this.debugEnabled) path.push({ ...pos });
        const protectedNow = t < Math.max(p.invincible, dash ? 0.3 : 0);
        let danger = 0;
        const trace = traces[i - 1];
        for (const e of trace.enemies) {
          const dx = pos.x - e.x,
            dy = pos.y - e.y,
            dd = dx * dx + dy * dy;
          if (dd > (e.r + 130) ** 2) continue;
          const gap = Math.sqrt(dd) - e.r;
          if (gap < 6 && !protectedNow) danger += 180 * e.weight;
          danger += e.weight * Math.max(0, this.config.clearance - gap) * 0.35;
          danger += Math.max(0, 130 - gap) * 0.008;
        }
        const enemyDanger = danger;
        if (!protectedNow)
          for (const b of trace.bullets) {
            const relativeStart = { x: b.bx - prev.x, y: b.by - prev.y };
            const relativeEnd = { x: b.x - pos.x, y: b.y - pos.y };
            const gap =
              segmentDistance({ x: 0, y: 0 }, relativeStart, relativeEnd) - b.r;
            danger += Math.max(0, 22 - gap) * (gap < 4 ? 10 : 0.6) * b.weight;
          }
        const bulletDanger = danger - enemyDanger;
        if (!protectedNow)
          for (const z of trace.zones)
            if (zoneContains(z, pos, 23))
              danger += Math.max(1, z.damage / 20) * 200;
        const zoneDanger = danger - enemyDanger - bulletDanger;
        for (const f of s.environment?.fields || [])
          if (
            f.kind === "eclipse" &&
            t >= f.delay &&
            distance(pos, f) < f.r + 20
          )
            danger += 20;
        for (const c of s.environment?.candies || [])
          if (["slow", "weak"].includes(c.kind) && distance(pos, c) < 38)
            danger += 25;
        const edge = Math.min(
          pos.x,
          pos.y,
          LIMITS.world - pos.x,
          LIMITS.world - pos.y,
        );
        danger += Math.max(0, 220 - edge) * 0.035;
        if (i <= 2) early += danger;
        risk +=
          danger *
          (this.config.nearTerm
            ? 1 / (0.12 + t * 2)
            : 1.2 - (t / horizon) * 0.5);
        if (parts) {
          const weight = this.config.nearTerm
            ? 1 / (0.12 + t * 2)
            : 1.2 - (t / horizon) * 0.5;
          parts.enemies += enemyDanger * weight;
          parts.bullets += bulletDanger * weight;
          parts.zones += zoneDanger * weight;
          parts.environment +=
            (danger - enemyDanger - bulletDanger - zoneDanger) * weight;
        }
      }
      const progress =
        (distance(p, this.goal) - distance(pos, this.goal)) /
        Math.max(1, speed * horizon);
      const inertia = dir.x * this.heading.x + dir.y * this.heading.y;
      const nearest = closest(pos, s.enemies as Enemy[], 1000);
      const bladeRange = p.weapons.blade
        ? 155 +
          Math.min(240, (p.upgrades.wide || 0) * 18) +
          (p.weapons.blade >= 3 ? 45 : 0)
        : 0;
      const desired = bladeRange ? bladeRange * 0.8 : 320;
      const offensive = nearest
        ? Math.max(0, distance(pos, nearest) - desired) * 0.012
        : 0;
      const stuck =
        distance(pos, p) < speed * horizon * 0.35 && (dir.x || dir.y) ? 8 : 0;
      return {
        dir,
        path,
        parts,
        dash,
        risk,
        early,
        score:
          risk +
          offensive +
          stuck -
          progress * this.config.loot -
          inertia * this.config.inertia,
      };
    };
    const candidates = dirs
      .map((d) => evaluate(d, false))
      .sort((a, b) => a.score - b.score);
    let best = candidates[0];
    if (
      p.dashCd <= 0 &&
      p.invincible < 0.15 &&
      (best.early > 30 || best.risk > 110)
    ) {
      const escapes = dirs
        .filter((d) => d.x || d.y)
        .map((d) => evaluate(d, true))
        .sort((a, b) => a.score - b.score);
      const escaped = escapes[0];
      if (this.debugEnabled) candidates.push(...escapes);
      if (escaped.score + 8 < best.score) best = escaped;
    }
    if (this.debugEnabled) {
      const nearest = enemies.reduce<(typeof enemies)[number] | undefined>(
        (a, b) => (!a || distance(b.e, p) < distance(a.e, p) ? b : a),
        undefined,
      );
      this.debug = {
        time: s.time,
        origin: { x: p.x, y: p.y },
        goal: { ...this.goal },
        algorithm: "predictive",
        selected: candidates.indexOf(best),
        candidates: candidates.map((c) => ({
          direction: { ...c.dir },
          dash: c.dash,
          path: c.path,
          score: c.score,
          risk: c.risk,
          early: c.early,
          parts: c.parts,
        })),
        dangers: zones
          .slice(0, 32)
          .map((z) => ({ ...z, shape: z.shape && { ...z.shape } })),
        nearestEnemy: nearest && {
          kind: nearest.e.kind,
          distance: distance(nearest.e, p),
          damage: nearest.e.damage,
        },
      };
    }
    this.heading = best.dir;
    const target = closest(p, s.enemies as Enemy[], 650);
    let aim: Vec = target || this.goal,
      aimScore = -Infinity;
    const radius = skillStats(p.skills[0], p.skillLevels[p.skills[0]]).radius;
    for (const e of enemies
      .filter((x) => distance(x.e, p) < 460)
      .slice(0, 45)) {
      const predicted = { x: e.e.x + e.vx * 0.22, y: e.e.y + e.vy * 0.22 };
      let score = ENEMIES[e.e.kind].boss ? 5 : 0;
      for (const other of enemies)
        if (distance(predicted, other.e) < radius + other.e.r) score += 1;
      if (score > aimScore) {
        aimScore = score;
        aim = predicted;
      }
    }
    const near = enemies.filter(
      (x) =>
        distance(x.e, p) < skillStats("ice", p.skillLevels.ice).radius + x.e.r,
    );
    const boss = enemies.some(
      (x) => ENEMIES[x.e.kind].boss && distance(x.e, p) < 450,
    );
    const heal = skillStats("bloom", p.skillLevels.bloom).heal;
    const skills = [
      p.skills[0] === "ice"
        ? near.length >= 2 || (near.length > 0 && (boss || best.risk > 25))
        : !!target && (distance(target, p) < 470 || p.skills[0] === "lance"),
      p.skills[1] === "bloom"
        ? p.maxHp - p.hp >= heal * 0.85
        : (best.risk > 50 && p.invincible < 0.3) ||
          (p.shield < 40 && enemies.length > 4),
      boss ||
        enemies.filter((x) => distance(x.e, p) < 380).length >= 7 ||
        (bullets.length > 8 && best.risk > 70),
    ];
    return {
      ...best.dir,
      dash: best.dash,
      aim,
      skills,
      skillAims: [
        aim,
        p,
        boss
          ? this.config.nearTerm
            ? enemies.find(
                (x) => ENEMIES[x.e.kind].boss && distance(x.e, p) < 450,
              )?.e || aim
            : target || aim
          : aim,
      ],
    };
  }
}
