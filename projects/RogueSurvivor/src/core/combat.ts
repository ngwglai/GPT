import { beginDefeat } from "./revival";
import { zoneContains } from "./attackGeometry";
import { temporary, hitCrystals, environment, addBuff } from "./environment";
import { selectTarget, frontalFactor } from "./targeting";
import { ENEMY_RULES } from "../data/enemies";
import { skillStats } from "../data/skills";
import { weaponStats } from "../data/weapons";
import { modifier, soft } from "./fate";
import type { Run, Enemy, Bullet, Vec, Effect } from "./types";
import { LIMITS, SKILLS, WEAPONS } from "../data/content";
import {
  closest,
  distance,
  random,
  unit,
  SpatialHash,
  segmentDistance,
  move,
} from "./math";
import { damageMultiplier } from "./progression";
export class Combat {
  effects: Effect[] = [];
  bulletPool: Bullet[] = [];
  grid = new SpatialHash<Enemy>();
  shake = 0;
  poseEvents = { cast: 0, hurt: 0, dash: 0 };
  lastSound = "";
  sounds = new Set<string>();
  sound(kind: string) {
    if (this.sounds.size < 24) this.sounds.add(kind);
  }
  constructor(public s: Run) {}
  effect(p: Vec, kind: string, r = 30, text?: string) {
    if (this.effects.length < LIMITS.effects)
      this.effects.push({ ...p, kind, r, text, life: 0.45, maxLife: 0.45 });
  }
  damage(e: Enemy, amount: number, source: string, crit = true, origin?: Vec) {
    if (e.hp <= 0) return;
    const p = this.s.player;
    const critical = crit && random(this.s) < p.crit;
    const synergy =
      e.slow > 0 || e.freeze > 0
        ? 1 + soft(p.upgrades.shatter || 0, 2) * 0.3
        : 1;
    const value = Math.min(
      LIMITS.number,
      amount *
        damageMultiplier(this.s) *
        temporary(this.s, "damage") *
        frontalFactor(e, origin) *
        modifier(this.s, "damage", source) *
        synergy *
        (p.upgrades.execution && e.hp / e.maxHp < 0.25 ? 1.4 : 1) *
        (p.upgrades.specialist
          ? 1 + 0.3 / Math.max(1, Object.keys(p.weapons).length)
          : 1) *
        (critical ? 2 : 1) *
        (e.kind === "guard" ? ENEMY_RULES.guardDamageFactor : 1),
    );
    const shield = e.behavior?.shield || 0,
      absorbed = Math.min(shield, value);
    if (e.behavior) e.behavior.shield -= absorbed;
    const actual = Math.min(e.hp, value - absorbed);
    e.hp -= value - absorbed;
    if (e.hp <= 0)
      for (const x of this.s.enemies)
        if (x.behavior?.shieldOwner === e.id) x.behavior.shield = 0;
    e.hit = 0.1;
    this.s.stats.damage = Math.min(LIMITS.number, this.s.stats.damage + actual);
    this.s.stats.bySource[source] = Math.min(
      LIMITS.number,
      (this.s.stats.bySource[source] || 0) + actual,
    );
    if (this.effects.length < 60 && value >= 1)
      this.effect(
        e,
        critical ? "critical" : "damage",
        12,
        String(Math.round(value)),
      );
  }
  hurt(amount: number) {
    const p = this.s.player;
    if (this.s.phase !== "playing" || p.invincible > 0 || p.hp <= 0) return;
    amount *= modifier(this.s, "taken");
    const absorbed = Math.min(p.shield, amount);
    p.shield -= absorbed;
    amount -= absorbed;
    p.hp = Math.max(0, p.hp - amount);
    p.invincible = 0.65;
    this.s.stats.taken = Math.min(LIMITS.number, this.s.stats.taken + amount);
    this.shake = 0.15;
    this.sound("hurt");
    this.poseEvents.hurt++;
    this.effect(p, "hurt", 35);
    if (p.hp <= 0 && beginDefeat(this.s)) this.sound("defeatPlayer");
  }
  heal(amount: number) {
    const p = this.s.player;
    if (p.hp <= 0) return;
    const n = Math.min(amount, p.maxHp - p.hp);
    p.hp += n;
    this.s.stats.healed = Math.min(LIMITS.number, this.s.stats.healed + n);
  }
  burn(e: Enemy, power: number, source: string) {
    e.burn = 3 + soft(this.s.player.upgrades.burn || 0, 4);
    e.burnPower =
      power * (1 + soft(this.s.player.upgrades.burn || 0, 4) * 0.25);
    e.burnSource = source;
  }
  area(p: Vec, r: number, damage: number, kind: string, source: string) {
    this.effect(p, kind, r);
    hitCrystals(
      this,
      p,
      r,
      damage *
        damageMultiplier(this.s) *
        modifier(this.s, "damage", source) *
        temporary(this.s, "damage"),
    );
    for (const e of this.grid.nearby(p, r + 64)) {
      if (e.hp <= 0 || distance(p, e) > r + e.r) continue;
      this.damage(e, damage, source);
      if (kind === "fire") this.burn(e, damage * 0.15, source);
      if (kind === "ice") {
        e.freeze = 1.2;
        e.slow = 4;
      }
      if (kind === "slash" || kind === "ward") {
        const n = unit(e.x - p.x, e.y - p.y);
        move(e, n.x * 22, n.y * 22, e.r, this.s.rocks);
      }
    }
  }
  shoot(
    p: Vec,
    dir: Vec,
    damage: number,
    kind: string,
    source: string,
    enemy = false,
    options: Partial<Bullet> = {},
  ) {
    if (this.s.bullets.length >= (enemy ? LIMITS.bullets - 96 : LIMITS.bullets))
      return false;
    const n = unit(dir.x, dir.y);
    const b = this.bulletPool.pop() || ({} as Bullet);
    delete b.motion;
    delete b.status;
    delete b.reflected;
    Object.assign(
      b,
      {
        id: this.s.nextId++,
        ...p,
        vx: n.x * (enemy ? 190 : 490),
        vy: n.y * (enemy ? 190 : 490),
        r: enemy ? 7 : 6,
        damage,
        life: enemy ? 6 : 1.5,
        enemy,
        pierce: 0,
        hits: [],
        kind,
        source,
        homing: false,
        split: false,
      },
      options,
    );
    this.s.bullets.push(b);
    return true;
  }
  zone(
    p: Vec,
    r: number,
    damage: number,
    kind: string,
    enemy: boolean,
    delay = 0.65,
    life = 0.2,
    source = kind,
  ) {
    if (this.s.zones.length >= (enemy ? LIMITS.zones - 16 : LIMITS.zones))
      return;
    this.s.zones.push({
      ...p,
      id: this.s.nextId++,
      r,
      damage,
      kind,
      enemy,
      delay,
      life,
      tick: 0,
      source,
    });
    return this.s.zones.at(-1)!;
  }
  cast(slot: number, aim: Vec) {
    const p = this.s.player;
    if (
      !Number.isInteger(slot) ||
      slot < 0 ||
      slot > 2 ||
      !Number.isFinite(aim.x) ||
      !Number.isFinite(aim.y) ||
      this.s.phase !== "playing" ||
      p.cooldowns[slot] > 0
    )
      return false;
    const id = p.skills[slot],
      lv = p.skillLevels[id],
      d = unit(aim.x - p.x, aim.y - p.y),
      range = Math.min(450, distance(aim, p)),
      target = { x: p.x + d.x * range, y: p.y + d.y * range };
    const zonesNeeded =
      id === "storm"
        ? skillStats(id, lv).shots
        : id === "fire"
          ? lv >= 3
            ? 3
            : 1
          : ["ice", "bloom"].includes(id)
            ? 1
            : 0;
    const bulletsNeeded = id === "lance" ? (lv >= 3 ? 3 : 1) : 0;
    if (
      this.s.zones.length + zonesNeeded > LIMITS.zones ||
      this.s.bullets.length + bulletsNeeded > LIMITS.bullets
    ) {
      this.s.event = "战场能量密集，请稍后施法（未消耗冷却）";
      this.s.eventUntil = this.s.time + 2;
      return false;
    }
    const stats = skillStats(id, lv);
    p.cooldowns[slot] =
      SKILLS[id].cooldown * p.cooldown * temporary(this.s, "cooldown");
    this.sound("cast-" + p.skills[slot]);
    this.poseEvents.cast++;
    if (id === "fire") {
      this.zone(
        target,
        stats.radius,
        stats.damage,
        "fire",
        false,
        0.25,
        stats.duration,
      );
      if (lv >= 3)
        for (const dx of [-95, 95])
          this.zone(
            { x: target.x + dx, y: target.y },
            70,
            65,
            "fire",
            false,
            0.6,
            0.8,
          );
    }
    if (id === "ice") {
      this.area(p, stats.radius, stats.damage, "ice", "ice");
      this.zone(p, stats.radius, 12, "ice", false, 0, stats.duration);
    }
    if (id === "lance") {
      for (let i = 0; i < (lv >= 3 ? 3 : 1); i++) {
        const a =
          Math.atan2(d.y, d.x) + (i - ((lv >= 3 ? 3 : 1) - 1) / 2) * 0.15;
        this.shoot(
          p,
          { x: Math.cos(a), y: Math.sin(a) },
          stats.damage,
          "lance",
          "lance",
          false,
          {
            vx: Math.cos(a) * 950,
            vy: Math.sin(a) * 950,
            pierce: 25,
            r: stats.radius,
            life: 0.8,
          },
        );
      }
    }
    if (id === "ward") {
      p.shield = Math.min(200, p.shield + stats.shield);
      p.invincible = Math.max(p.invincible, stats.duration);
      this.area(p, stats.radius, stats.damage, "ward", "ward");
    }
    if (id === "bloom") {
      this.heal(stats.heal);
      this.zone(
        p,
        stats.radius,
        stats.damage,
        "bloom",
        false,
        0,
        stats.duration,
      );
      this.effect(p, "bloom", 130);
    }
    if (id === "storm") {
      for (let i = 0; i < skillStats(id, lv).shots; i++) {
        const a = i * 2.4,
          r = i === 0 ? 0 : 70 + random(this.s) * 190;
        this.zone(
          { x: target.x + Math.cos(a) * r, y: target.y + Math.sin(a) * r },
          130,
          stats.damage,
          "storm",
          false,
          0.2 + i * 0.14,
          0.25,
          "storm",
        );
      }
      for (const b of this.s.bullets) if (b.enemy) b.life = 0;
      this.shake = 0.2;
    }
    return true;
  }
  auto(dt: number) {
    if (this.s.phase !== "playing") return;
    const p = this.s.player;
    for (const key of Object.keys(p.weapons) as (keyof typeof WEAPONS)[]) {
      p.weaponTimers[key] -= dt;
      if (p.weaponTimers[key] > 0) continue;
      const w = WEAPONS[key],
        lv = p.weapons[key]!,
        mult = weaponStats(key, lv).damage / w.damage;
      p.weaponTimers[key] =
        w.interval /
        ((1 + (lv - 1) * 0.08) *
          modifier(this.s, "interval", key) *
          temporary(this.s, "interval"));
      const enemy = selectTarget(
        this.s,
        key,
        w.range,
        environment(this.s).targets[key],
      );
      if (enemy) environment(this.s).targets[key] = enemy.id;
      const target =
        enemy ||
        environment(this.s).crystals.find(
          (x) =>
            distance(p, x) < w.range &&
            !this.s.rocks.some(
              (r) => r.crystalId !== x.id && segmentDistance(r, p, x) < r.r + 3,
            ),
        );
      if (target) this.sound(lv >= 5 ? "attackStrong" : "attack");
      if (key === "blade") {
        this.area(
          p,
          w.range +
            Math.min(240, (p.upgrades.wide || 0) * 18) +
            (lv >= 5 ? 35 : 0),
          w.damage * mult,
          "slash",
          key,
        );
        p.shield += Math.min(
          Math.max(0, 80 - p.shield),
          Math.min(40, (p.upgrades.wide || 0) * 2),
        );
        continue;
      }
      if (key === "orbit") {
        const count = 2 + (p.upgrades.satellite || 0) + (lv >= 5 ? 2 : 0);
        for (let i = 0; i < count; i++) {
          const a = this.s.time * 2 + (i * Math.PI * 2) / count;
          const pos = {
            x: p.x + Math.cos(a) * (95 + (p.upgrades.satellite || 0) * 12),
            y: p.y + Math.sin(a) * (95 + (p.upgrades.satellite || 0) * 12),
          };
          this.area(pos, 29, w.damage * mult, "orbit", key);
          for (const e of this.grid.nearby(pos, 65))
            if (distance(e, pos) < e.r + 30) e.slow = 1.5;
        }
        continue;
      }
      if (!target) {
        p.weaponTimers[key] = 0.08;
        continue;
      }
      const dir = unit(target.x - p.x, target.y - p.y),
        angle = Math.atan2(dir.y, dir.x);
      const count =
        key === "bow"
          ? 1 + (p.upgrades.fork || 0) + (lv >= 5 ? 1 : 0)
          : key === "drone"
            ? 2 + (p.upgrades.swarm || 0)
            : 1;
      for (let i = 0; i < count; i++) {
        const a = angle + (i - (count - 1) / 2) * 0.14;
        const pos =
          key === "drone"
            ? {
                x: p.x + Math.cos(this.s.time + i * 2) * 50,
                y: p.y + Math.sin(this.s.time + i * 2) * 50,
              }
            : p;
        this.shoot(
          pos,
          { x: Math.cos(a), y: Math.sin(a) },
          w.damage * mult,
          key,
          key,
          false,
          {
            pierce: p.upgrades.pierce || 0,
            homing: !!p.upgrades.homing || (key === "drone" && lv >= 5),
            split: key === "bow" && !!p.upgrades.split,
            r: key === "ember" ? 10 : 5,
          },
        );
      }
      if (key === "drone")
        p.weaponTimers[key] /= 1 + (p.upgrades.swarm || 0) * 0.2;
    }
  }
  projectiles(dt: number) {
    const s = this.s;
    for (const b of s.bullets) {
      if (s.phase !== "playing") break;
      if (b.motion) {
        const m = b.motion;
        if (!s.enemies.some((e) => e.id === m.owner && e.hp > 0)) {
          b.life = 0;
          continue;
        }
        if (m.wait > 0) {
          m.wait -= dt;
          continue;
        }
        if (m.bounces > 0 && m.bounceIn !== undefined) {
          m.bounceIn -= dt;
          if (m.bounceIn <= 0) {
            b.vy = -b.vy;
            m.bounces--;
            m.bounceIn = 0.8;
          }
        }
        const speed = Math.hypot(b.vx, b.vy);
        if (m.track > 0) {
          const desired = Math.atan2(s.player.y - b.y, s.player.x - b.x),
            current = Math.atan2(b.vy, b.vx);
          const delta = Math.atan2(
            Math.sin(desired - current),
            Math.cos(desired - current),
          );
          const a = current + Math.max(-dt * 1.5, Math.min(dt * 1.5, delta));
          b.vx = Math.cos(a) * speed;
          b.vy = Math.sin(a) * speed;
          m.track = Math.max(0, m.track - dt);
        }
        if (m.turn) {
          const a = Math.atan2(b.vy, b.vx) + m.turn * dt;
          b.vx = Math.cos(a) * speed;
          b.vy = Math.sin(a) * speed;
        }
        if (
          m.bounces > 0 &&
          (b.x + b.vx * dt < b.r ||
            b.x + b.vx * dt > LIMITS.world - b.r ||
            b.y + b.vy * dt < b.r ||
            b.y + b.vy * dt > LIMITS.world - b.r)
        ) {
          if (b.x + b.vx * dt < b.r || b.x + b.vx * dt > LIMITS.world - b.r)
            b.vx = -b.vx;
          if (b.y + b.vy * dt < b.r || b.y + b.vy * dt > LIMITS.world - b.r)
            b.vy = -b.vy;
          m.bounces--;
        }
      }
      b.life -= dt;
      if (b.life <= 0) continue;
      const before = { x: b.x, y: b.y };
      if (b.homing) {
        const target = closest(b, s.enemies, 220);
        if (target) {
          const d = unit(target.x - b.x, target.y - b.y),
            speed = Math.hypot(b.vx, b.vy);
          b.vx += (d.x * speed - b.vx) * Math.min(1, dt * 8);
          b.vy += (d.y * speed - b.vy) * Math.min(1, dt * 8);
        }
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < 0 || b.y < 0 || b.x > LIMITS.world || b.y > LIMITS.world)
        b.life = 0;
      if (!b.enemy && b.kind !== "lance") {
        const rock = s.rocks.find(
          (r) => segmentDistance(r, before, b) < r.r + b.r,
        );
        if (rock) {
          if (rock.crystalId)
            hitCrystals(
              this,
              rock,
              2,
              b.damage *
                damageMultiplier(s) *
                modifier(s, "damage", b.source) *
                temporary(s, "damage"),
            );
          b.life = 0;
          continue;
        }
      }
      if (b.enemy) {
        if (segmentDistance(s.player, before, b) < b.r + 16) {
          const vulnerable = s.player.invincible <= 0 && s.player.hp > 0;
          this.hurt(b.damage);
          if (b.status && vulnerable) addBuff(s, b.status, 5);
          b.life = 0;
        }
        continue;
      }
      for (const e of this.grid.nearby(b, 80 + Math.hypot(b.vx, b.vy) * dt)) {
        if (
          e.hp <= 0 ||
          b.hits.includes(e.id) ||
          segmentDistance(e, before, b) > e.r + b.r
        )
          continue;
        b.hits.push(e.id);
        if (
          e.kind === "mirror" &&
          (e.behavior?.reflecting || 0) > 0 &&
          (e.behavior?.warning || 0) <= 0 &&
          !b.reflected &&
          b.kind !== "lance"
        ) {
          b.reflected = true;
          b.enemy = true;
          b.homing = false;
          b.split = false;
          b.pierce = 0;
          b.damage = Math.min(12, b.damage * 0.3);
          b.vx *= -0.65;
          b.vy *= -0.65;
          b.life = Math.min(1.5, b.life);
          b.source = "mirror";
          this.effect(e, "reflect", 40);
          break;
        }
        this.damage(e, b.damage, b.source, true, before);
        if (b.kind === "ember") {
          this.burn(e, b.damage * 0.18, b.source);
          this.area(
            e,
            s.player.weapons.ember === 5 ? 90 : 55,
            b.damage * 0.4,
            "fire",
            b.source,
          );
        }
        if (b.split) {
          b.split = false;
          for (let i = -1; i <= 1; i++) {
            const a = Math.atan2(b.vy, b.vx) + i * 0.65;
            this.shoot(
              e,
              { x: Math.cos(a), y: Math.sin(a) },
              b.damage * 0.5,
              "fragment",
              b.source,
              false,
              { life: 0.45, hits: [e.id] },
            );
          }
        }
        if (b.pierce-- <= 0) {
          b.life = 0;
          break;
        }
      }
    }
    let write = 0;
    for (const b of s.bullets) {
      if (b.life > 0) s.bullets[write++] = b;
      else if (this.bulletPool.length < LIMITS.bullets) this.bulletPool.push(b);
    }
    s.bullets.length = write;
    for (const z of s.zones) {
      if (s.phase !== "playing") break;
      if (z.life <= 0) continue;
      if (z.shape) {
        if (!s.enemies.some((e) => e.id === z.shape!.owner && e.hp > 0)) {
          z.life = 0;
          continue;
        }
        if (z.delay <= 0) {
          z.shape.angle += z.shape.omega * dt;
          z.x += z.shape.vx * dt;
          z.y += z.shape.vy * dt;
        }
      }
      if (z.delay > 0) {
        z.delay -= dt;
        continue;
      }
      z.life -= dt;
      if (z.enemy && z.shape) {
        if (zoneContains(z, s.player)) this.hurt(z.damage);
        continue;
      }
      z.tick -= dt;
      if (z.tick > 0) continue;
      z.tick = 0.5;
      if (z.enemy) {
        if (zoneContains(z, s.player)) this.hurt(z.damage);
      } else {
        this.area(z, z.r, z.damage, z.kind, z.source);
        if (z.kind === "bloom" && distance(z, s.player) < z.r) this.heal(4);
      }
    }
    s.zones = s.zones.filter((z) => z.life > 0);
  }
  tickEffects(dt: number) {
    for (const e of this.effects) e.life -= dt;
    this.effects = this.effects.filter((e) => e.life > 0);
    this.shake = Math.max(0, this.shake - dt);
  }
}
