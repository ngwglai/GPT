import { entryWindow } from "../src/core/waves";
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
it("director admits exactly one finite budget across fractional timesteps", () => {
  const w = new World(createRun("endless"));
  w.s.nextEvent = 9999;
  let count = 0;
  for (let i = 0; i < 200; i++) {
    w.s.time += 0.05;
    director(w, 0.05);
  }
  count = w.s.enemies.length;
  expect(count).toBe(w.s.wave!.budget);
  expect(w.s.wave!.processed).toBe(count);
  expect(w.s.time).toBeGreaterThan(entryWindow(w.s.wave!) - 0.8);
  const ids = w.s.enemies.map((e) => e.id);
  for (let i = 0; i < 200; i++) {
    w.s.time += 0.05;
    director(w, 0.05);
  }
  expect(w.s.enemies.map((e) => e.id)).toEqual(ids);
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
  expect(zoneContains(z, { x: 210, y: 30 }, 10)).toBe(false);
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
it.each(Object.keys(BOSS_MOVES) as (keyof typeof ENEMIES)[])(
  "%s has three mechanically distinct slot signatures",
  (kind) => {
    const signatures = [];
    for (let slot = 0; slot < 3; slot++) {
      const w = new World(createRun("endless"));
      const e = spawn(w, kind, { x: 2100, y: 1800 })!;
      e.phase = slot;
      e.timer = 0;
      if (["warden", "witch", "titan"].includes(kind)) bossPatterns(w, e, 0.05);
      else advancedAI(w, e, 0.05);
      signatures.push(
        JSON.stringify({
          zones: [
            ...new Set(
              w.s.zones.map((z) =>
                [
                  z.kind,
                  z.shape?.kind,
                  !!z.shape?.omega,
                  !!z.shape?.vx || !!z.shape?.vy,
                ].join(":"),
              ),
            ),
          ].sort(),
          bullets: [
            ...new Set(
              w.s.bullets.map((b) =>
                [!!b.motion?.turn, !!b.motion?.track, !!b.motion?.bounces].join(
                  ":",
                ),
              ),
            ),
          ].sort(),
          dash: !!e.dashPattern,
        }),
      );
    }
    expect(new Set(signatures).size).toBe(3);
  },
);
it("slow still scales normal and dash movement of the original bosses", () => {
  for (const dash of [false, true]) {
    const distances = [];
    for (const slow of [0, 4]) {
      const w = new World(createRun("endless"));
      w.s.rocks = [];
      const e = spawn(w, "titan", { x: 2200, y: 1800 })!;
      e.timer = 10;
      e.slow = slow;
      if (dash) e.dashPattern = { wait: 0, time: 0.42, left: 1, dx: -1, dy: 0 };
      const x = e.x;
      bossPatterns(w, e, 0.05);
      distances.push(Math.abs(e.x - x));
    }
    expect(distances[1] / distances[0]).toBeCloseTo(0.48);
  }
});
it("mirror copy rotation is independent of three-slot attack phase and survives save", () => {
  const w = new World(createRun("endless"));
  w.s.player.weapons = { bow: 1, blade: 1, ember: 1 };
  const e = spawn(w, "mirrorMaiden", { x: 2100, y: 1800 })!;
  const seen = new Set<string>();
  for (let i = 0; i < 12; i++) {
    e.timer = 0;
    advancedAI(w, e, 0.05);
    for (const z of w.s.zones) seen.add(z.kind);
  }
  expect(seen.has("mirrorArrow")).toBe(true);
  expect(seen.has("mirrorSlash")).toBe(true);
  expect(seen.has("mirrorFire")).toBe(true);
  expect(
    validateRun(w.s).enemies.find((x) => x.id === e.id)?.behavior?.copyShots,
  ).toBe(4);
});
it("a rotating beam hits during its crossing rather than skipping half-second gaps", () => {
  const w = new World(createRun("endless"));
  const e = spawn(w, "crystalQueen", { x: 1800, y: 1800 })!;
  w.s.player.x = 1800 + Math.cos(0.12) * 480;
  w.s.player.y = 1800 + Math.sin(0.12) * 480;
  w.s.player.invincible = 0;
  const z = w.zone(e, 20, 10, "bossShape", true, 0, 1.2)!;
  z.shape = {
    kind: "bar",
    angle: 0,
    length: 1000,
    halfAngle: Math.PI / 4,
    omega: 0.45,
    vx: 0,
    vy: 0,
    owner: e.id,
  };
  const hp = w.s.player.hp;
  for (let i = 0; i < 5; i++) w.projectiles(0.05);
  expect(w.s.player.hp).toBeLessThan(hp);
});
