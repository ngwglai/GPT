import { it, expect } from "vitest";
import {
  difficulty,
  LIMITS,
  ENEMIES,
  bossAttackInterval,
} from "../src/data/content";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { spawn, director, ai } from "../src/core/director";
import { bossPatterns, BOSS_MOVES } from "../src/core/bossPatterns";
import { advancedAI } from "../src/core/creatureAI";
import { zoneContains } from "../src/core/attackGeometry";
import { validateRun } from "../src/services/storage";
it("interpolates actual pack/interval rates and preserves combat growth", () => {
  [2, 4, 6, 9, 12, 18, 25].forEach((rate, i) => {
    const t = [0, 300, 600, 900, 1200, 1800, 3600][i],
      d = difficulty(t);
    expect(d.pack / d.spawn).toBeCloseTo(rate);
  });
  expect(difficulty(450).pack / difficulty(450).spawn).toBeCloseTo(5);
  expect(difficulty(3600).hp).toBe(1000);
  expect(difficulty(3600).damage).toBe(150);
  expect(difficulty(3600).attackRate).toBe(12);
  expect(bossAttackInterval(3600, true)).toBeCloseTo(0.16);
  expect(LIMITS.enemies).toBe(800);
});
it("director accumulates fractional intervals without discarding frame remainder", () => {
  const w = new World(createRun("endless"));
  w.s.time = 3600;
  w.s.nextBoss = 9999;
  w.s.nextEvent = 9999;
  w.s.spawnTimer = 0.08;
  // Remove only spawned units to measure the uncapped ordinary generator.
  let count = 0;
  for (let i = 0; i < 200; i++) {
    director(w, 0.05);
    count += w.s.enemies.length;
    w.s.enemies = [];
  }
  expect(count).toBeGreaterThanOrEqual(248);
  expect(count).toBeLessThanOrEqual(250);
});
it.each(Object.keys(BOSS_MOVES) as (keyof typeof ENEMIES)[])(
  "%s cycles distinct slots with valid stage-two saved state and bounded schedules",
  (kind) => {
    const w = new World(createRun("endless"));
    w.s.player.invincible = 999;
    const e = spawn(w, kind, { x: 2100, y: 1800 })!;
    e.hp = e.maxHp * 0.3;
    for (let i = 0; i < 6; i++) {
      e.timer = 0;
      if (["warden", "witch", "titan"].includes(kind)) bossPatterns(w, e, 0.05);
      else advancedAI(w, e, 0.05);
    }
    expect(e.phase).toBe(6);
    expect(w.s.zones.length + w.s.bullets.length).toBeGreaterThan(0);
    expect(() => validateRun(w.s)).not.toThrow();
    const restored = new World(validateRun(w.s));
    expect(restored.s.bullets).toEqual(w.s.bullets);
    expect(restored.s.zones).toEqual(w.s.zones);
    const before = w.s.bullets.length;
    e.hp = 0;
    ai(w, 0.1);
    expect(w.s.bullets.length).toBe(before);
    w.projectiles(0.05);
    expect(w.s.zones.filter((z) => z.shape)).toHaveLength(0);
  },
);
it("bar and sector hit tests match the drawn directional shape instead of a circle", () => {
  const z: any = {
    x: 0,
    y: 0,
    r: 20,
    shape: { kind: "bar", angle: 0, length: 400, halfAngle: Math.PI / 4 },
  };
  expect(zoneContains(z, { x: 180, y: 0 }, 0)).toBe(true);
  expect(zoneContains(z, { x: 0, y: 50 }, 0)).toBe(false);
  z.r = 200;
  z.shape.kind = "fan";
  expect(zoneContains(z, { x: 150, y: 0 }, 0)).toBe(true);
  expect(zoneContains(z, { x: -150, y: 0 }, 0)).toBe(false);
});
it("waiting bullets cannot hurt; finite tracking locks off and dead-owner schedules terminate", () => {
  const w = new World(createRun("endless"));
  const e = spawn(w, "witch", { x: 1800, y: 1600 })!;
  w.shoot(w.s.player, { x: 1, y: 0 }, 10, "enemy", "witch", true, {
    motion: { wait: 0.5, track: 0.3, turn: 0, bounces: 0, owner: e.id },
  });
  const hp = w.s.player.hp;
  w.projectiles(0.1);
  expect(w.s.player.hp).toBe(hp);
  const b = w.s.bullets[0];
  b.x = 100;
  b.y = 100;
  for (let i = 0; i < 10; i++) w.projectiles(0.1);
  expect(b.motion!.track).toBe(0);
  e.hp = 0;
  w.projectiles(0.1);
  expect(w.s.bullets).toHaveLength(0);
});
it("original boss steering still makes progress around a boulder", () => {
  const w = new World(createRun("endless"));
  w.s.rocks = [{ x: 1900, y: 1800, r: 45 }];
  w.s.player.invincible = 999;
  const e = spawn(w, "warden", { x: 2100, y: 1800 })!;
  for (let i = 0; i < 240; i++) bossPatterns(w, e, 0.05);
  expect(Math.hypot(e.x - 1800, e.y - 1800)).toBeLessThan(180);
});
