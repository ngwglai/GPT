import { tickWaves } from "./waves";
import { bossPatterns } from "./bossPatterns";
import { advancedAI, tickDefense } from "./creatureAI";
import { environment } from "./environment";
import { MAPS } from "../data/maps";
import { ENEMY_RULES } from "../data/enemies";
import type { EnemyId, Vec } from "./types";
import {
  ENEMIES,
  LIMITS,
  difficulty,
  bossHpMultiplier,
  bossDamageMultiplier,
  bossAttackInterval,
} from "../data/content";
import { clamp, distance, move, random, unit } from "./math";
import { Combat } from "./combat";
export function spawn(c: Combat, kind: EnemyId, position?: Vec, elite = false) {
  const s = c.s,
    def = ENEMIES[kind];
  if (s.enemies.length >= (def.boss ? LIMITS.enemies : LIMITS.enemies - 3))
    return;
  if (
    kind === "butterfly" &&
    s.enemies.filter((e) => e.hp > 0 && e.kind === kind).length >= 12
  )
    return;
  const angle = random(s) * Math.PI * 2;
  const p = position || {
    x: clamp(s.player.x + Math.cos(angle) * 690, 70, LIMITS.world - 70),
    y: clamp(s.player.y + Math.sin(angle) * 690, 70, LIMITS.world - 70),
  };
  if (!position && distance(p, s.player) < 300) {
    p.x = s.player.x < 1800 ? s.player.x + 600 : s.player.x - 600;
  }
  const d = difficulty(s.time);
  const hp =
    def.hp *
    MAPS[environment(s).mapId].difficulty *
    (def.boss ? bossHpMultiplier(s.time) : d.hp) *
    (elite ? ENEMY_RULES.elite.hp : 1);
  const e = {
    id: s.nextId++,
    kind,
    ...p,
    hp,
    maxHp: hp,
    r: def.r * (elite ? ENEMY_RULES.elite.r : 1),
    speed: def.speed * d.speed * (elite ? ENEMY_RULES.elite.speed : 1),
    damage:
      def.damage *
      (def.boss ? bossDamageMultiplier(s.time) : d.damage) *
      (elite ? ENEMY_RULES.elite.damage : 1),
    elite,
    timer: 1.2 + random(s),
    phase: 0,
    slow: 0,
    freeze: 0,
    burn: 0,
    burnPower: 0,
    burnSource: "ember",
    hit: 0,
    charge: null,
  };
  move(e, 0, 0, e.r, s.rocks);
  s.enemies.push(e);
  return e;
}
export function director(c: Combat, dt: number) {
  const s = c.s,
    d = difficulty(s.time);
  tickWaves(c, dt, spawn);
  if (s.time >= s.nextEvent) {
    s.nextEvent += 90;
    const events = ["兽潮来袭", "流星雨", "生命潮汐", "月蚀弹幕"];
    s.event = events[Math.floor(random(s) * events.length)];
    s.eventUntil = s.time + 16;
    if (s.event === "生命潮汐") {
      c.heal(s.player.maxHp * 0.25);
      for (const g of s.gems) {
        g.x = s.player.x;
        g.y = s.player.y;
      }
    }
  }
  if (s.time < s.eventUntil) {
    if (
      s.event === "流星雨" &&
      Math.floor(s.time * 2) !== Math.floor((s.time - dt) * 2)
    ) {
      const a = random(s) * Math.PI * 2,
        r = 100 + random(s) * 400;
      c.zone(
        { x: s.player.x + Math.cos(a) * r, y: s.player.y + Math.sin(a) * r },
        65,
        16 * d.damage,
        "meteor",
        true,
        1.3,
        0.2,
      );
    }
    if (
      s.event === "月蚀弹幕" &&
      Math.floor(s.time) !== Math.floor(s.time - dt)
    ) {
      const a = random(s) * Math.PI * 2;
      const p = {
        x: s.player.x + Math.cos(a) * 500,
        y: s.player.y + Math.sin(a) * 500,
      };
      c.shoot(
        p,
        { x: -Math.cos(a), y: -Math.sin(a) },
        12 * d.damage,
        "enemy",
        "event",
        true,
      );
    }
  }
}
export function ai(c: Combat, dt: number) {
  const s = c.s,
    p = s.player;
  for (const e of s.enemies) {
    if (s.phase !== "playing") break;
    if (e.hp <= 0) continue;
    tickDefense(s, e, dt);
    e.hit = Math.max(0, e.hit - dt);
    e.freeze = Math.max(0, e.freeze - dt);
    e.slow = Math.max(0, e.slow - dt);
    if (e.burn > 0) {
      e.burn -= dt;
      c.damage(e, e.burnPower * dt, e.burnSource, false, undefined, {
        kind: "burn",
      });
    }
    if (e.hp <= 0 || e.freeze > 0) continue;
    if (["warden", "witch", "titan"].includes(e.kind)) {
      bossPatterns(c, e, dt);
      continue;
    }
    if (advancedAI(c, e, dt)) continue;
    const def = ENEMIES[e.kind];
    const d = distance(e, p),
      n = unit(p.x - e.x, p.y - e.y);
    let vx = n.x,
      vy = n.y;
    e.timer -= dt;
    if (e.charge) {
      if (e.timer > 0) {
        vx = 0;
        vy = 0;
      } else if (e.timer > -0.42) {
        vx = e.charge.x * 4;
        vy = e.charge.y * 4;
      } else {
        e.charge = null;
        e.timer = ENEMIES[e.kind].boss
          ? bossAttackInterval(s.time, e.hp / e.maxHp < ENEMY_RULES.bossPhaseHp)
          : 2.8 / difficulty(s.time).attackRate;
      }
    }
    if (!e.charge) {
      if (
        (e.kind === "archer" || e.kind === "seer" || e.kind === "shaman") &&
        d < 280
      ) {
        vx = -n.y * 0.5 - n.x * 0.25;
        vy = n.x * 0.5 - n.y * 0.25;
      }
      if (e.kind === "runner" && e.timer <= 0 && d < 360) {
        e.charge = n;
        e.timer = 0.65;
        c.effect(e, "warning", 35);
        vx = vy = 0;
      }
      if (e.kind === "bomber" && d < 100 && e.timer <= 0) {
        c.zone({ ...p }, 80, e.damage, "meteor", true, 0.95, 0.2);
        e.timer = 3 / difficulty(s.time).attackRate;
      }
      if (e.kind === "archer" && e.timer <= 0) {
        const count = s.time >= 1200 ? 3 : 1;
        for (let i = 0; i < count; i++) {
          const a = Math.atan2(n.y, n.x) + (i - (count - 1) / 2) * 0.18;
          c.shoot(
            e,
            { x: Math.cos(a), y: Math.sin(a) },
            e.damage,
            "enemy",
            "enemy",
            true,
          );
        }
        e.timer = 2.7 / difficulty(s.time).attackRate;
      }
      if (e.kind === "seer" && e.timer <= 0) {
        c.zone(
          {
            x: clamp(p.x + p.dx * 70, 20, LIMITS.world - 20),
            y: clamp(p.y + p.dy * 70, 20, LIMITS.world - 20),
          },
          85,
          e.damage,
          "meteor",
          true,
          1.2,
          0.2,
        );
        e.timer = 3.8 / difficulty(s.time).attackRate;
      }
      if (e.kind === "shaman" && e.timer <= 0) {
        for (let i = 0; i < 2; i++)
          spawn(c, "crawler", { x: e.x + (i * 2 - 1) * 50, y: e.y });
        e.timer = 7 / Math.sqrt(difficulty(s.time).attackRate);
      }
    }
    // Local steering around sparse, separated circular obstacles; sliding prevents dead ends.
    for (const rock of s.rocks) {
      if (distance(e, rock) < e.r + rock.r + 52) {
        const away = unit(e.x - rock.x, e.y - rock.y);
        if (vx * away.x + vy * away.y < 0.2) {
          const side = n.x * -away.y + n.y * away.x >= 0 ? 1 : -1;
          vx += (-away.y * side + away.x) * 1.4;
          vy += (away.x * side + away.y) * 1.4;
        }
      }
    }
    const speed = e.speed * (e.slow > 0 ? 0.48 : 1);
    if (!e.charge) {
      const norm = unit(vx, vy);
      vx = norm.x;
      vy = norm.y;
    }
    move(e, vx * speed * dt, vy * speed * dt, e.r, s.rocks);
    if (distance(e, p) < e.r + 16) c.hurt(e.damage);
  }
}
