import { modifier } from "./fate";
import type { Run, Input } from "./types";
import { Combat } from "./combat";
import { ai, director } from "./director";
import { ENEMIES, LIMITS } from "../data/content";
import { checkLevel, applyUpgrade } from "./progression";
import { distance, move, unit, clamp } from "./math";
export class World extends Combat {
  constructor(s: Run) {
    super(s);
    this.grid.rebuild(s.enemies);
  }
  choose(id: string) {
    return applyUpgrade(this.s, id);
  }
  continueEndless() {
    if (this.s.phase !== "victory") return;
    this.s.mode = "endless";
    this.s.phase = "playing";
    this.s.victoryClaimed = true;
    this.s.nextBoss = this.s.time + 300;
    this.s.player.hp = this.s.player.maxHp;
    checkLevel(this.s);
  }
  step(dt: number, input: Input) {
    if (this.s.phase !== "playing" || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 1 / 20);
    const s = this.s,
      p = s.player;
    s.time = Math.min(LIMITS.number, s.time + dt);
    this.tickEffects(dt);
    p.invincible = Math.max(0, p.invincible - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.cooldowns = p.cooldowns.map((cd) => Math.max(0, cd - dt));
    p.dash = Math.max(0, p.dash - dt);
    this.heal(p.regen * dt);
    let nx = clamp(input.x, -1, 1),
      ny = clamp(input.y, -1, 1);
    if (nx || ny) {
      const n = unit(nx, ny);
      nx = n.x;
      ny = n.y;
      if (p.dash <= 0) {
        p.dx = nx;
        p.dy = ny;
      }
    }
    if (input.dash && p.dashCd <= 0) {
      p.dash = 0.18;
      p.invincible = 0.3;
      p.dashCd = Math.max(1.3, 2.7 - (p.upgrades.stride || 0) * 0.2);
      this.effect(p, "dash", 45);
      this.lastSound = "dash";
    }
    if (p.dash > 0) {
      nx = p.dx;
      ny = p.dy;
    }
    move(
      p,
      nx * p.speed * dt * (p.dash > 0 ? 4 : 1),
      ny * p.speed * dt * (p.dash > 0 ? 4 : 1),
      16,
      s.rocks,
    );
    director(this, dt);
    ai(this, dt);
    if (s.phase === "dead") {
      s.enemies = s.enemies.filter((e) => e.hp > 0);
      return;
    }
    this.grid.rebuild(s.enemies);
    input.skills?.forEach((pressed, i) => {
      if (pressed) this.cast(i, input.aim);
    });
    this.auto(dt);
    this.projectiles(dt);
    if ((s.phase as string) === "dead") {
      s.enemies = s.enemies.filter((e) => e.hp > 0);
      return;
    }
    for (const e of s.enemies) {
      if (e.hp > 0) continue;
      s.stats.kills = Math.min(LIMITS.number, s.stats.kills + 1);
      const def = ENEMIES[e.kind];
      if (p.upgrades.harvest) this.heal(0.3);
      const value = def.xp * (e.elite ? 3 : 1);
      if (s.gems.length < LIMITS.gems) s.gems.push({ x: e.x, y: e.y, value });
      else {
        let g = s.gems[0];
        for (const other of s.gems)
          if (distance(e, other) < distance(e, g)) g = other;
        g.value = Math.min(LIMITS.number, g.value + value);
      }
      if (e.burn > 0 && p.upgrades.wildfire) {
        for (const other of this.grid.nearby(e, 145)) {
          if (other.hp > 0 && distance(other, e) < 145)
            this.burn(
              other,
              e.burnPower / (1 + (p.upgrades.burn || 0) * 0.25),
              e.burnSource,
            );
        }
      }
      if (def.boss) {
        s.stats.bosses++;
        p.xp += value * modifier(s, "xp");
        this.heal(p.maxHp * 0.3);
        s.event = "首领已击破";
        s.eventUntil = s.time + 5;
        if (s.mode === "standard" && s.bossIndex >= 4 && e.kind === "titan") {
          s.phase = "victory";
          s.victoryClaimed = true;
        }
      }
    }
    s.enemies = s.enemies.filter((e) => e.hp > 0);
    for (const g of s.gems) {
      const d = distance(g, p);
      if (d < p.magnet) {
        const n = unit(p.x - g.x, p.y - g.y),
          speed = Math.min(d, 460 * dt);
        g.x += n.x * speed;
        g.y += n.y * speed;
      }
      if (distance(g, p) < 22) {
        p.xp = Math.min(LIMITS.number, p.xp + g.value * modifier(s, "xp"));
        g.value = 0;
      }
    }
    s.gems = s.gems.filter((g) => g.value > 0);
    checkLevel(s);
    s.stats.peakEnemies = Math.max(s.stats.peakEnemies, s.enemies.length);
    s.stats.peakBullets = Math.max(s.stats.peakBullets, s.bullets.length);
  }
}
