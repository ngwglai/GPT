import { buildState } from "./buildState";
import { CORE_PARAMS } from "../data/cards/cores";
import { GROWTH_RULES } from "../data/growth";
import {
  ensureRevival,
  acceptRevival,
  declineRevival,
  tickRevival,
  rewardBossLife,
  REVIVAL_RULES,
} from "./revival";
import { ensureWaves } from "./waves";
import { addExperienceGem } from "./gems";
import { environment, tickEnvironment, temporary } from "./environment";
import { childSpawn } from "./creatureAI";
import { MAPS, ENV_RULES } from "../data/maps";
import { ENEMY_RULES } from "../data/enemies";
import { ensureDeck } from "./deckState";
import { rollDrops, collectDrops } from "./drops";
import { modifier, soft } from "./fate";
import type { Run, Input } from "./types";
import { Combat } from "./combat";
import { ai, director } from "./director";
import { ENEMIES, LIMITS } from "../data/content";
import { checkLevel, applyUpgrade } from "./progression";
import { distance, move, unit, clamp } from "./math";
export class World extends Combat {
  constructor(s: Run) {
    super(s);
    ensureDeck(s);
    ensureWaves(s);
    ensureRevival(s);
    this.grid.rebuild(s.enemies);
  }
  advancePresentation(dt: number) {
    const changed = tickRevival(this.s, dt);
    if (changed && this.s.phase === "playing") {
      this.effect(this.s.player, "revive", REVIVAL_RULES.clearRadius);
      this.sound("revived");
      checkLevel(this.s);
    }
    return changed;
  }
  revive() {
    if (!acceptRevival(this.s)) return false;
    const kept = [];
    for (const b of this.s.bullets) {
      if (b.enemy && distance(b, this.s.player) <= REVIVAL_RULES.clearRadius) {
        if (this.bulletPool.length < LIMITS.bullets) this.bulletPool.push(b);
      } else kept.push(b);
    }
    this.s.bullets = kept;
    this.effect(this.s.player, "revive", REVIVAL_RULES.clearRadius);
    this.sound("revive");
    return true;
  }
  declineRevival() {
    return declineRevival(this.s);
  }
  choose(id: string) {
    return applyUpgrade(this.s, id);
  }
  continueEndless() {
    if (this.s.phase !== "victory") return;
    this.s.mode = "endless";
    this.s.phase = "playing";
    this.s.victoryClaimed = true;
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
    tickEnvironment(this, dt);
    if (s.phase !== "playing") {
      this.settleDeaths();
      return;
    }
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
      if (p.upgrades.glass_comet) {
        p.hp = Math.max(Math.min(1, p.hp), p.hp * (1 - CORE_PARAMS.comet.cost));
        buildState(s).dashUntil = Math.min(
          1e12,
          s.time + CORE_PARAMS.comet.duration,
        );
      }
      p.dash = 0.18;
      p.invincible = Math.max(p.invincible, 0.3);
      p.dashCd = Math.max(1.3, 2.7 - (p.upgrades.stride || 0) * 0.2);
      this.effect(p, "dash", 45);
      this.sound("dash");
      this.poseEvents.dash++;
    }
    if (p.dash > 0) {
      nx = p.dx;
      ny = p.dy;
    }
    move(
      p,
      nx * p.speed * temporary(s, "speed") * dt * (p.dash > 0 ? 4 : 1),
      ny * p.speed * temporary(s, "speed") * dt * (p.dash > 0 ? 4 : 1),
      16,
      s.rocks,
    );
    director(this, dt);
    ai(this, dt);
    if ((s.phase as string) !== "playing") {
      this.settleDeaths();
      return;
    }
    this.grid.rebuild(s.enemies);
    input.skills?.forEach((pressed, i) => {
      if (pressed) this.cast(i, input.skillAims?.[i] || input.aim);
    });
    this.auto(dt);
    this.projectiles(dt);
    if ((s.phase as string) !== "playing") {
      this.settleDeaths();
      return;
    }
    this.settleDeaths();
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
        this.effect(p, "pickup", 18);
        this.sound("pickup");
        g.value = 0;
      }
    }
    s.gems = s.gems.filter((g) => g.value > 0);
    collectDrops(s, dt);
    checkLevel(s);
    s.stats.peakEnemies = Math.max(s.stats.peakEnemies, s.enemies.length);
    s.stats.peakBullets = Math.max(s.stats.peakBullets, s.bullets.length);
  }
  private settleDeaths() {
    const s = this.s,
      p = s.player;
    for (const e of s.enemies) {
      if (e.hp > 0) continue;
      s.stats.kills = Math.min(LIMITS.number, s.stats.kills + 1);
      const def = ENEMIES[e.kind];
      this.sound(def.boss ? "bossDefeat" : "death");
      if (e.kind === "splitter" && !e.behavior?.child) {
        for (let i = 0; i < ENV_RULES.children; i++)
          childSpawn(this, e, "splitter", {
            x: e.x + (i * 2 - 1) * 28,
            y: e.y,
          });
      }
      if (!e.behavior?.rewardless)
        rollDrops(s, e, def.boss ? "boss" : e.elite ? "elite" : "normal");
      if (p.upgrades.harvest) this.heal(0.3);
      const value = def.xp * (e.elite ? ENEMY_RULES.elite.xp : 1);
      if (!e.behavior?.rewardless) {
        const overflow = addExperienceGem(s, e, value);
        if (overflow) p.xp += overflow * modifier(s, "xp");
      }
      if (e.burn > 0 && p.upgrades.wildfire) {
        for (const other of this.grid.nearby(e, 145)) {
          if (other.hp > 0 && distance(other, e) < 145)
            this.burn(
              other,
              e.burnPower /
                (1 + soft(p.upgrades.burn || 0, 4) * GROWTH_RULES.burnStep),
              e.burnSource,
            );
        }
      }
      if (def.boss) {
        if (e.kind === "candyWitch") environment(s).rule = 0;
        s.stats.bosses++;
        p.xp += value * modifier(s, "xp");
        this.heal(p.maxHp * 0.3);
        const life = rewardBossLife(s, e);
        if (life) this.sound("spark");
        s.event = life ? "首领已击破 · 获得星火 × 1" : "首领已击破";
        s.eventUntil = s.time + 5;
        if (
          s.mode === "standard" &&
          (e.bossOrdinal === 4 ||
            (e.bossOrdinal === undefined && s.bossIndex >= 4)) &&
          e.kind === MAPS[environment(s).mapId].bosses[3]
        ) {
          s.phase = "victory";
          s.victoryClaimed = true;
        }
      }
    }
    s.enemies = s.enemies.filter((e) => e.hp > 0);
  }
}
