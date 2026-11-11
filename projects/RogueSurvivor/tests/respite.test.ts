import { expect, it } from "vitest";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { director, spawn } from "../src/core/director";
import {
  newWave,
  entryWindow,
  prepareRest,
  waveRemaining,
} from "../src/core/waves";
import { validateRun } from "../src/services/storage";
import { environment, addField } from "../src/core/environment";
import { MAPS, type MapId } from "../src/data/maps";
const input = { x: 0, y: 0, aim: { x: 2200, y: 1800 } };
function cleared(map: MapId = "forest", number = 1) {
  const w = new World(
    createRun("endless", "ranger", 181, undefined, undefined, map),
  );
  w.s.time = 40;
  w.s.wave = newWave(number, 0);
  w.s.wave.processed = w.s.wave.spawned = w.s.wave.budget;
  w.s.wave.status = "active";
  w.s.player.invincible = 999;
  w.s.nextEvent = 1e9;
  return w;
}
it("70/90 second deadlines, 18–30 entry windows, original fixed budgets", () => {
  const points = [
    [1, 28],
    [5, 52],
    [10, 86],
    [15, 120],
    [20, 156],
    [30, 210],
    [60, 280],
    [120, 360],
  ];
  for (const [n, b] of points) {
    const w = newWave(n, 0);
    expect(w.duration).toBe(n % 5 === 0 ? 90 : 70);
    expect(w.budget).toBe(b);
    expect(entryWindow(w)).toBe(Math.min(30, 18 + (n - 1) * 0.3));
  }
});
it("clearance enters a full five-second state, even across the combat deadline", () => {
  const w = cleared();
  w.s.time = 69;
  director(w, 0.05);
  expect(w.s.wave!.status).toBe("resting");
  expect(waveRemaining(w.s)).toBe(5);
  w.s.time = 73.999;
  director(w, 0.05);
  expect(w.s.wave!.number).toBe(1);
  w.s.time = 74;
  director(w, 0.05);
  expect(w.s.wave!.number).toBe(2);
  expect(w.s.wave!.status).toBe("entering");
  expect(w.s.enemies.length).toBeGreaterThan(0);
  director(w, 0.05);
  expect(w.s.wave!.number).toBe(2);
});
it("entry, unresolved deaths and pending Boss all block premature respite", () => {
  const w = cleared("forest", 5);
  prepareRest(w);
  expect(w.s.wave!.status).toBe("active");
  director(w, 0.05);
  expect(w.s.bossIndex).toBe(1);
  const boss = w.s.enemies.find((e) => e.bossOrdinal === 1)!;
  w.s.enemies = [boss];
  boss.hp = 0;
  prepareRest(w);
  expect(w.s.wave!.status).toBe("active");
  w.s.enemies = [];
  w.s.wave!.processed--;
  w.s.wave!.spawned--;
  w.s.wave!.status = "entering";
  prepareRest(w);
  expect(w.s.wave!.status).toBe("entering");
});
it("new enemy cancels rest rather than declaring a clear arena during combat", () => {
  const w = cleared();
  director(w, 0.05);
  const e = spawn(w, "crawler")!;
  w.s.time++;
  director(w, 0.05);
  expect(w.s.wave!.status).toBe("active");
  expect(w.s.wave!.restUntil).toBe(0);
  expect(w.s.enemies).toContain(e);
  expect(w.s.wave!.number).toBe(1);
});
it("rest retains movement, experience and extra card drops; draw freezes time", () => {
  const w = cleared();
  director(w, 0.05);
  const x = w.s.player.x;
  w.s.gems.push({ x, y: w.s.player.y, value: 1 });
  w.s.rewardDrops = [{ x, y: w.s.player.y, kind: "positive", count: 1 }];
  w.step(0.05, { ...input, x: 1 });
  expect(w.s.player.x).toBeGreaterThan(x);
  expect(w.s.player.xp).toBeGreaterThan(0);
  expect(w.s.rewardDrops).toHaveLength(0);
  expect(w.s.phase).toBe("upgrade");
  const snapshot = structuredClone(w.s);
  for (let i = 0; i < 100; i++) w.step(0.05, input);
  expect(w.s.time).toBe(snapshot.time);
  expect(w.s.wave).toEqual(snapshot.wave);
});
it.each(Object.keys(MAPS) as MapId[])(
  "%s rest clears hostile remnants and defers world/map hazards",
  (map) => {
    const w = cleared(map);
    const p = w.s.player;
    w.s.player.invincible = 0;
    w.s.nextEvent = w.s.time;
    w.s.event = "月蚀弹幕";
    w.s.eventUntil = w.s.time + 16;
    w.s.environment!.nextField = w.s.environment!.nextCandy = 0;
    w.shoot(p, { x: 1, y: 0 }, 99, "enemy", "event", true);
    w.zone(p, 100, 99, "meteor", true, 0, 10);
    addField(w.s, p, "eclipse", 0);
    const hp = p.hp;
    for (let i = 0; i < 60; i++) w.step(0.05, input);
    expect(w.s.wave!.status).toBe("resting");
    expect(w.s.enemies).toHaveLength(0);
    expect(w.s.bullets.some((b) => b.enemy)).toBe(false);
    expect(w.s.zones.some((z) => z.enemy)).toBe(false);
    expect(environment(w.s).fields.some((f) => f.kind === "eclipse")).toBe(
      false,
    );
    expect(p.hp).toBe(hp);
    expect(w.s.nextEvent).toBeCloseTo(43);
  },
);
it("rest save/restore is identical, idempotent and reaches the Boss wave once", () => {
  const w = cleared("forest", 4);
  director(w, 0.05);
  for (let i = 0; i < 30; i++) w.step(0.05, input);
  const raw = structuredClone(w.s),
    s = validateRun(raw);
  expect(waveRemaining(s)).toBeCloseTo(3.5);
  expect(validateRun(s)).toEqual(s);
  expect(s).toEqual(raw);
  const restored = new World(s);
  for (let i = 0; i < 80; i++) {
    w.step(0.05, input);
    restored.step(0.05, input);
  }
  expect(restored.s).toEqual(w.s);
  expect(w.s.wave!.number).toBe(5);
  expect(w.s.bossIndex).toBe(1);
  expect(w.s.enemies.filter((e) => e.bossOrdinal === 1)).toHaveLength(1);
});
it.each(["entering", "active"] as const)(
  "legacy wave schema1 %s migrates without replay or lost RNG",
  (status) => {
    const s = cleared().s;
    const old = structuredClone(s) as any;
    old.wave.schema = 1;
    delete old.wave.restUntil;
    old.wave.duration = 55;
    old.wave.status = status;
    if (status === "entering") {
      old.wave.processed = old.wave.spawned = 8;
    }
    const migrated = validateRun(old);
    expect(migrated.wave!.schema).toBe(2);
    expect(migrated.wave!.duration).toBe(70);
    expect(migrated.wave!.processed).toBe(old.wave.processed);
    expect(migrated.wave!.restUntil).toBe(0);
    expect(migrated.rng).toBe(old.rng);
    expect(validateRun(migrated)).toEqual(migrated);
    expect(old.wave.schema).toBe(1);
  },
);
it.each([NaN, -1, 46, undefined])(
  "rejects invalid rest deadline %s",
  (value) => {
    const w = cleared();
    director(w, 0.05);
    (w.s.wave as any).restUntil = value;
    expect(() => validateRun(w.s)).toThrow();
  },
);
