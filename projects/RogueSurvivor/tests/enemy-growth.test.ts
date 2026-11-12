import { describe, expect, it } from "vitest";
import {
  difficulty,
  bossHpMultiplier,
  bossDamageMultiplier,
  bossAttackRate,
  bossAttackInterval,
  ENEMIES,
} from "../src/data/content";
import { enemyGrowth } from "../src/data/enemyGrowth";
import { MAPS, ENV_RULES, type MapId } from "../src/data/maps";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { spawn, ai, director } from "../src/core/director";
import { behavior, advancedAI, childSpawn } from "../src/core/creatureAI";
import { newWave } from "../src/core/waves";
import { validateRun } from "../src/services/storage";
import { damageBreakdown } from "../src/core/damage";
import type { EnemyId } from "../src/core/types";

// Independent acceptance values from the v1.8.3 specification; seconds convert only at the boundary.
const points = [
  [0, 1, 1, 1, 0.03, 3, 2, 1],
  [2.5, 1.5, 1.4, 1.25, 0.045, 3, 2, 1],
  [5, 2, 1.8, 1.5, 0.06, 3, 2, 1],
  [7.5, 2.5, 2.2, 1.75, 0.075, 4.5, 2.8, 1.25],
  [10, 3, 2.6, 2, 0.09, 6, 3.6, 1.5],
  [15, 4, 3.4, 2.5, 0.12, 9, 5.2, 2],
  [20, 5, 4.2, 3, 0.15, 12, 6.8, 2.5],
  [30, 7, 5.8, 4, 0.21, 18, 10, 3.5],
  [60, 13, 10.6, 7, 0.39, 36, 19.6, 6.5],
  [90, 19, 15.4, 10, 0.48, 54, 29.2, 9.5],
] as const;
const bosses = [
  "warden",
  "witch",
  "titan",
  "crystalQueen",
  "candyWitch",
  "eclipseSaint",
  "mirrorMaiden",
] as const;
function world(time = 3600, map: MapId = "forest") {
  const c = new World(
    createRun("endless", "ranger", 183, undefined, undefined, map),
  );
  c.s.time = time;
  c.s.rocks = c.s.rocks.filter((r) => r.crystalId !== undefined);
  c.s.nextEvent = 9999;
  c.s.wave = newWave(1, time);
  Object.assign(c.s.wave, {
    processed: c.s.wave.budget,
    spawned: c.s.wave.budget,
    status: "active",
    announced: true,
  });
  c.s.player.invincible = 999;
  return c;
}
const add = (c: World, kind: EnemyId, elite = false, x = 2200) =>
  spawn(c, kind, { x, y: 1800 }, elite)!;

describe("specified linear growth in actual minutes", () => {
  it.each(points)(
    "%s minutes matches normal/elite/boss acceptance values",
    (t, h, d, a, p, bh, bd, ba) => {
      const n = difficulty(t * 60);
      expect(n.hp).toBeCloseTo(h, 12);
      expect(n.damage).toBeCloseTo(d, 12);
      expect(n.attackRate).toBeCloseTo(a, 12);
      expect(n.elite).toBeCloseTo(p, 12);
      expect(n.speed).toBeCloseTo(1 + 0.012 * t, 12);
      expect(bossHpMultiplier(t * 60)).toBeCloseTo(bh, 12);
      expect(bossDamageMultiplier(t * 60)).toBeCloseTo(bd, 12);
      expect(bossAttackRate(t * 60)).toBeCloseTo(ba, 12);
      expect(bossAttackInterval(t * 60, false)).toBeCloseTo(1.5 / ba, 12);
      expect(bossAttackInterval(t * 60, true)).toBeCloseTo(1.2 / ba, 12);
    },
  );
  it("has constant slopes between and beyond former milestones, with a continuous boss five-minute boundary", () => {
    for (let t = 0; t < 150; t += 0.25) {
      const x = difficulty(t * 60),
        y = difficulty((t + 0.25) * 60);
      expect(y.hp - x.hp).toBeCloseTo(0.05, 12);
      expect(y.damage - x.damage).toBeCloseTo(0.04, 12);
      expect(y.attackRate - x.attackRate).toBeCloseTo(0.025, 12);
      if (t >= 5) {
        expect(
          bossHpMultiplier((t + 0.25) * 60) - bossHpMultiplier(t * 60),
        ).toBeCloseTo(0.15, 12);
        expect(
          bossDamageMultiplier((t + 0.25) * 60) - bossDamageMultiplier(t * 60),
        ).toBeCloseTo(0.08, 12);
        expect(
          bossAttackRate((t + 0.25) * 60) - bossAttackRate(t * 60),
        ).toBeCloseTo(0.025, 12);
      }
    }
    expect(bossHpMultiplier(300 - 1e-6)).toBe(3);
    expect(bossHpMultiplier(300 + 1e-6)).toBeCloseTo(3, 6);
  });
  it("caps elite probability at 75 minutes, without capping other growth or the boss interval at 60 minutes", () => {
    expect(difficulty(4500).elite).toBe(0.48);
    expect(difficulty(7200).elite).toBe(0.48);
    expect(difficulty(7200).hp).toBe(25);
    expect(difficulty(7200).damage).toBeCloseTo(20.2);
    expect(difficulty(7200).attackRate).toBe(13);
    expect(bossHpMultiplier(7200)).toBe(72);
    expect(bossAttackInterval(5400, true)).toBeLessThan(0.16);
    expect(bossAttackInterval(7200, true)).toBeLessThan(
      bossAttackInterval(5400, true),
    );
    for (const value of Object.values(enemyGrowth(1e12)))
      expect(Number.isFinite(value)).toBe(true);
  });
  it("handles invalid formula inputs without producing NaN or Infinity", () => {
    for (const t of [-60, NaN, Infinity, -Infinity]) {
      expect(enemyGrowth(t)).toEqual(enemyGrowth(0));
      expect(bossHpMultiplier(t)).toBe(3);
      expect(bossDamageMultiplier(t)).toBe(2);
      expect(bossAttackRate(t)).toBe(1);
    }
  });
  it.each(points)(
    "normal and elite births at %s minutes combine the correct unchanged map/base/elite stats",
    (t, h, d) => {
      for (const map of Object.keys(MAPS) as MapId[]) {
        const c = world(t * 60, map);
        for (const elite of [false, true]) {
          const e = add(c, "crawler", elite);
          expect(e.hp).toBeCloseTo(
            40 * MAPS[map].difficulty * h * (elite ? 2.4 : 1),
          );
          expect(e.maxHp).toBe(e.hp);
          expect(e.damage).toBeCloseTo(9 * d * (elite ? 1.3 : 1));
          // Includes the explicitly requested uncapped movement formula.
          expect(e.speed).toBeCloseTo(
            66 * (1 + 0.012 * t) * (elite ? 1.12 : 1),
          );
          expect(validateRun(c.s).enemies.at(-1)).toEqual(e);
        }
      }
    },
  );
  it.each(bosses)(
    "%s retains its independent base HP/damage and applies growth once",
    (kind) => {
      for (const [t, , , , , h, d] of points) {
        const c = world(t * 60),
          e = add(c, kind);
        expect(e.hp).toBeCloseTo(ENEMIES[kind].hp * h);
        expect(e.damage).toBeCloseTo(ENEMIES[kind].damage * d);
        expect(validateRun(c.s).enemies[0]).toEqual(e);
      }
    },
  );
});

describe("actual attack, summon and world-event consumers", () => {
  it.each([
    ["archer", 2.7],
    ["seer", 3.8],
    ["bomber", 3],
    ["ghost", 5],
    ["mirror", 5],
    ["hexer", 3.8],
  ] as const)(
    "%s resets its original base cooldown divided by the new frequency",
    (kind, base) => {
      const c = world(),
        e = add(c, kind, false, kind === "bomber" ? 1880 : 2200);
      e.timer = 0;
      ai(c, 0.05);
      expect(e.timer).toBeCloseTo(base / 7);
      const attacks = [
        ...c.s.bullets.filter((b) => b.enemy),
        ...c.s.zones.filter((z) => z.enemy),
      ];
      for (const x of attacks)
        expect(x.damage).toBeCloseTo(ENEMIES[kind].damage * 10.6);
    },
  );
  it.each(bosses)(
    "%s all three modes apply one second-phase interval modifier, never twice",
    (kind) => {
      for (const second of [false, true])
        for (const mode of [0, 1, 2]) {
          const c = world(),
            e = add(c, kind);
          e.hp = e.maxHp * (second ? 0.3 : 0.9);
          e.phase = mode;
          e.timer = 0;
          ai(c, 0.05);
          expect(e.phase).toBe(mode + 1);
          expect(e.timer).toBeCloseTo((1.5 / 6.5) * (second ? 0.8 : 1));
        }
    },
  );
  it("preserves the strict 45% boss stage threshold", () => {
    const c = world(),
      e = add(c, "warden");
    e.hp = 0.45 * e.maxHp;
    e.timer = 0;
    ai(c, 0.05);
    expect(e.timer).toBeCloseTo(1.5 / 6.5);
    e.hp = 0.449 * e.maxHp;
    e.timer = 0;
    ai(c, 0.05);
    expect(e.timer).toBeCloseTo(1.2 / 6.5);
  });
  it.each(["shaman", "summoner"] as const)(
    "%s children use current birth multipliers and retain the square-root summon cadence",
    (kind) => {
      const c = world(),
        e = add(c, kind);
      e.timer = 0;
      ai(c, 0.05);
      const children = c.s.enemies.filter((x) => x.id !== e.id);
      expect(children).toHaveLength(kind === "shaman" ? 2 : 1);
      for (const child of children) {
        expect(child.hp).toBe(40 * 13);
        expect(child.damage).toBeCloseTo(9 * 10.6);
        if (kind === "summoner") expect(behavior(child).rewardless).toBe(true);
      }
      expect(e.timer).toBeCloseTo(7 / Math.sqrt(7));
    },
  );
  it("split children keep their original 0.3 HP and 0.6 damage modifiers", () => {
    const c = world(),
      owner = add(c, "splitter");
    const child = childSpawn(c, owner, "splitter", { x: 2300, y: 1800 })!;
    expect(child.hp).toBeCloseTo(90 * 13 * 0.3);
    expect(child.damage).toBeCloseTo(10 * 10.6 * 0.6);
    expect(behavior(child).child && behavior(child).rewardless).toBe(true);
  });
  it.each(["流星雨", "月蚀弹幕"])(
    "%s uses current linear damage, not the removed milestone table",
    (event) => {
      const c = world(3600.01);
      add(c, "crawler");
      c.s.event = event;
      c.s.eventUntil = c.s.time + 16;
      director(c, 0.05);
      const d = 1 + 0.16 * (c.s.time / 60);
      if (event === "流星雨") {
        expect(c.s.zones).toHaveLength(1);
        expect(c.s.zones[0].damage).toBeCloseTo(16 * d);
      } else {
        expect(c.s.bullets).toHaveLength(1);
        expect(c.s.bullets[0].damage).toBeCloseTo(12 * d);
      }
    },
  );
});

describe("unchanged defenses, healing and saved birth attributes", () => {
  it("retains guard armor and directional crab defense against player hits", () => {
    const c = world(),
      guard = add(c, "guard"),
      crab = add(c, "crab");
    expect(damageBreakdown(c.s, guard, 100, "bow").total).toBeCloseTo(72);
    behavior(crab).facing = 0;
    expect(
      damageBreakdown(c.s, crab, 100, "bow", false, {
        x: crab.x + 50,
        y: crab.y,
      }).total,
    ).toBeCloseTo(35);
    expect(
      damageBreakdown(c.s, crab, 100, "bow", false, {
        x: crab.x - 50,
        y: crab.y,
      }).total,
    ).toBeCloseTo(100);
  });
  it("retains fairy heal fraction/cooldown and protector capacity with larger current HP", () => {
    const c = world(),
      target = add(c, "guard"),
      fairy = add(c, "fairy"),
      shield = add(c, "protector");
    target.hp = target.maxHp / 2;
    fairy.timer = shield.timer = 0;
    const hp = target.hp;
    advancedAI(c, fairy, 0.05);
    advancedAI(c, shield, 0.05);
    expect(target.hp - hp).toBeCloseTo(target.maxHp * ENV_RULES.healFraction);
    expect(fairy.timer).toBe(ENV_RULES.healPeriod);
    expect(behavior(target).shield).toBe(ENV_RULES.shieldCapacity);
    expect(shield.timer).toBe(ENV_RULES.shieldPeriod);
    fairy.timer = 0;
    advancedAI(c, fairy, 0.05);
    expect(target.hp - hp).toBeCloseTo(target.maxHp * ENV_RULES.healFraction);
  });
  it("legitimate uncapped late speed remains saveable beyond the old 1000 limit", () => {
    const c = world(720 * 60),
      e = add(c, "mimic", true);
    expect(e.speed).toBeGreaterThan(1000);
    expect(e.speed).toBeCloseTo(125 * 1.12 * (1 + 0.012 * 720));
    expect(validateRun(c.s).enemies[0].speed).toBe(e.speed);
    e.speed = Infinity;
    expect(() => validateRun(c.s)).toThrow();
    e.speed = -1;
    expect(() => validateRun(c.s)).toThrow();
    e.speed = 1e12 + 1;
    expect(() => validateRun(c.s)).toThrow();
  });
  it("existing saved enemies retain HP, damage, RNG and in-progress timers; new births use the new time curve", () => {
    const c = world(3600),
      e = add(c, "archer");
    // A real v1.8.2 60-minute birth; do not silently heal/rescale existing enemies on load.
    e.hp = 46000;
    e.maxHp = 46000;
    e.damage = 1800;
    e.speed = 88;
    e.timer = 0.123;
    const rng = c.s.rng,
      restored = new World(validateRun(c.s));
    expect(restored.s.rng).toBe(rng);
    expect(restored.s.enemies[0]).toEqual(e);
    const next = add(restored, "archer");
    expect(next.hp).toBe(46 * 13);
    expect(next.damage).toBeCloseTo(12 * 10.6);
    expect(next.speed).toBeCloseTo(55 * 1.72);
    const old = restored.s.enemies[0];
    old.timer = 0;
    ai(restored, 0.05);
    expect(old.hp).toBe(46000);
    expect(old.damage).toBe(1800);
    expect(old.speed).toBe(88);
    expect(old.timer).toBeCloseTo(2.7 / 7);
  });
});
