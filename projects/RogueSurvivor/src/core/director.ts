import type { EnemyId, Vec } from "./types";
import { ENEMIES, LIMITS, difficulty } from "../data/content";
import { clamp, distance, move, random, unit } from "./math";
import { Combat } from "./combat";
export function spawn(c: Combat, kind: EnemyId, position?: Vec, elite = false) {
  const s = c.s,
    def = ENEMIES[kind];
  if (s.enemies.length >= (def.boss ? LIMITS.enemies : LIMITS.enemies - 3))
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
    (def.boss ? 1 + Math.max(0, s.time / 60 - 5) * 0.065 : d.hp) *
    (elite ? 2.4 : 1);
  const e = {
    id: s.nextId++,
    kind,
    ...p,
    hp,
    maxHp: hp,
    r: def.r * (elite ? 1.2 : 1),
    speed: def.speed * d.speed * (elite ? 1.12 : 1),
    damage: def.damage * d.damage * (elite ? 1.3 : 1),
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
  s.spawnTimer -= dt;
  if (s.spawnTimer <= 0) {
    s.spawnTimer =
      d.spawn * (s.event === "兽潮来袭" && s.time < s.eventUntil ? 0.6 : 1);
    const pool: EnemyId[] = ["crawler", "crawler", "runner"];
    if (s.time > 70) pool.push("archer");
    if (s.time > 150) pool.push("guard", "bomber");
    if (s.time > 240) pool.push("seer");
    if (s.time > 400) pool.push("shaman");
    spawn(
      c,
      pool[Math.floor(random(s) * pool.length)],
      undefined,
      random(s) < d.elite,
    );
  }
  if (s.time >= s.nextBoss && !s.enemies.some((e) => ENEMIES[e.kind].boss)) {
    const kinds: EnemyId[] =
      s.mode === "standard"
        ? ["warden", "witch", "warden", "titan"]
        : ["warden", "witch", "titan"];
    const kind = kinds[s.bossIndex % kinds.length];
    spawn(c, kind);
    s.bossIndex++;
    s.nextBoss += 300;
    s.event = `首领降临 · ${ENEMIES[kind].name}`;
    s.eventUntil = s.time + 8;
  }
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
    if (e.hp <= 0) continue;
    e.hit = Math.max(0, e.hit - dt);
    e.freeze = Math.max(0, e.freeze - dt);
    e.slow = Math.max(0, e.slow - dt);
    if (e.burn > 0) {
      e.burn -= dt;
      c.damage(e, e.burnPower * dt, e.burnSource, false);
    }
    if (e.hp <= 0 || e.freeze > 0) continue;
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
        e.timer = 2.8;
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
        e.timer = 3;
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
        e.timer = 2.7;
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
        e.timer = 3.8;
      }
      if (e.kind === "shaman" && e.timer <= 0) {
        for (let i = 0; i < 2; i++)
          spawn(c, "crawler", { x: e.x + (i * 2 - 1) * 50, y: e.y });
        e.timer = 7;
      }
      if (def.boss && e.timer <= 0) {
        const phase = e.hp / e.maxHp < 0.45 ? 2 : 1,
          level = Math.min(5, Math.floor(s.time / 1200));
        e.phase++;
        e.timer = Math.max(1.8, 4.8 - phase * 0.6 - level * 0.2);
        if (e.kind === "warden") {
          for (let i = 0; i < 3 + phase + level; i++) {
            const a = (i * Math.PI * 2) / (3 + phase + level);
            c.zone(
              { x: p.x + Math.cos(a) * 120, y: p.y + Math.sin(a) * 120 },
              67,
              e.damage,
              "roots",
              true,
              1.25,
              0.6,
            );
          }
          if (phase === 2) c.zone(p, 75, e.damage, "roots", true, 1.5, 0.2);
        }
        if (e.kind === "witch") {
          const count = 10 + phase * 3 + level * 2;
          for (let i = 0; i < count; i++) {
            const a = (i * Math.PI * 2) / count + e.phase * 0.33;
            c.shoot(
              e,
              { x: Math.cos(a), y: Math.sin(a) },
              e.damage,
              "enemy",
              "witch",
              true,
              { life: 5 },
            );
          }
          if (phase === 2)
            c.zone({ ...p }, 85, e.damage, "meteor", true, 1.3, 0.2);
        }
        if (e.kind === "titan") {
          if (e.phase % 2 === 0) {
            e.charge = n;
            e.timer = 1.1;
          } else
            for (let i = 0; i < 4 + phase + level; i++)
              c.zone(
                {
                  x: p.x + (random(s) - 0.5) * 550,
                  y: p.y + (random(s) - 0.5) * 420,
                },
                90,
                e.damage,
                "meteor",
                true,
                1 + i * 0.12,
                0.3,
              );
        }
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
