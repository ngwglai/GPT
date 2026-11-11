import { expect, it } from "vitest";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { director, spawn } from "../src/core/director";
import {
  newWave,
  waveRemaining,
  bossesDue,
  entryWindow,
} from "../src/core/waves";
import { validateRun } from "../src/services/storage";
import { MAPS, type MapId } from "../src/data/maps";
import { ENEMIES, LIMITS } from "../src/data/content";
const input = { x: 0, y: 0, aim: { x: 2200, y: 1800 } };
const make = () => {
  const w = new World(createRun("endless", "ranger", 521));
  w.s.nextEvent = 1e9;
  w.s.player.invincible = 999;
  return w;
};
function finishAdmission(w: World) {
  w.s.time = w.s.wave!.startedAt + entryWindow(w.s.wave!);
  director(w, 0.05);
}
it("fresh empty arena first admits enemies, and unfinished admission cannot skip", () => {
  const w = make();
  director(w, 0.05);
  expect(w.s.wave!.number).toBe(1);
  expect(w.s.enemies.length).toBeGreaterThan(0);
  expect(w.s.wave!.status).toBe("entering");
  w.s.enemies = [];
  for (let i = 0; i < 10; i++) director(w, 0.05);
  expect(w.s.wave!.number).toBe(1);
  finishAdmission(w);
  expect(w.s.wave!.processed).toBe(w.s.wave!.budget);
  w.s.enemies = [];
  director(w, 0.05);
  expect(w.s.wave!.number).toBe(1);
  expect(w.s.wave!.status).toBe("resting");
  expect(waveRemaining(w.s)).toBe(5);
  w.s.time += 5;
  director(w, 0.05);
  expect(w.s.wave!.number).toBe(2);
  expect(w.s.enemies.length).toBeGreaterThan(0);
});
it("timeout advances exactly once and retains every old living enemy", () => {
  const w = make();
  director(w, 0.05);
  const before = [...w.s.enemies];
  w.s.time = 1000;
  director(w, 0.05);
  expect(w.s.wave!.number).toBe(2);
  expect(before.every((e) => w.s.enemies.includes(e) && e.hp > 0)).toBe(true);
  expect(waveRemaining(w.s)).toBe(70);
  director(w, 0.05);
  expect(w.s.wave!.number).toBe(2);
});
it("deadlines bound summon and split blockers without deleting them", () => {
  const w = make();
  const e = spawn(w, "summoner")!;
  finishAdmission(w);
  director(w, 0.05);
  expect(w.s.wave!.number).toBe(1);
  w.s.time = 70;
  director(w, 0.05);
  expect(w.s.wave!.number).toBe(2);
  expect(w.s.enemies.includes(e)).toBe(true);
});
it("cap consumes unadmitted ordinary slots and never accumulates a spawn backlog", () => {
  const w = make();
  for (let i = 0; i < LIMITS.enemies; i++) spawn(w, "crawler");
  const ids = w.s.enemies.map((e) => e.id);
  finishAdmission(w);
  expect(w.s.wave!.processed).toBe(w.s.wave!.budget);
  expect(w.s.wave!.skipped).toBe(w.s.wave!.budget);
  expect(w.s.enemies.map((e) => e.id)).toEqual(ids);
  w.s.time = 70;
  director(w, 0.05);
  expect(w.s.wave!.number).toBe(2);
  expect(w.s.enemies.length).toBe(LIMITS.enemies - 3);
});
it.each(Object.keys(MAPS) as MapId[])(
  "%s boss order is wave-based, unique and survives overlap",
  (map) => {
    const w = new World(
      createRun("standard", "ranger", 925, undefined, undefined, map),
    );
    for (let i = 1; i <= 4; i++) {
      w.s.wave = newWave(i * 5, w.s.time);
      director(w, 0.05);
      const bosses = w.s.enemies.filter((e) => ENEMIES[e.kind].boss);
      expect(bosses).toHaveLength(1);
      expect(bosses[0].kind).toBe(MAPS[map].bosses[i - 1]);
      expect(bosses[0].bossOrdinal).toBe(i);
      for (let j = 0; j < 30; j++) director(w, 0.05);
      expect(w.s.bossIndex).toBe(i);
      w.s.enemies = [];
    }
  },
);
it("boss queue retains due ordinals with at most one living boss", () => {
  const w = make();
  w.s.wave = newWave(5, 0);
  director(w, 0.05);
  const first = w.s.enemies.find((e) => ENEMIES[e.kind].boss)!;
  w.s.wave = newWave(15, 0);
  director(w, 0.05);
  expect(bossesDue(w.s) - w.s.bossIndex).toBe(2);
  expect(w.s.enemies.filter((e) => ENEMIES[e.kind].boss)).toEqual([first]);
  w.s.enemies = w.s.enemies.filter((e) => e !== first);
  director(w, 0.05);
  expect(w.s.bossIndex).toBe(2);
  expect(w.s.enemies.filter((e) => ENEMIES[e.kind].boss)).toHaveLength(1);
});
it("a blocked boss retains its ordinal and spawns when capacity becomes available", () => {
  const w = make();
  w.s.wave = newWave(5, 0);
  for (let i = 0; i < LIMITS.enemies; i++) spawn(w, "warden");
  w.s.enemies.forEach((e) => {
    e.kind = "crawler";
  });
  director(w, 0.05);
  expect(w.s.bossIndex).toBe(0);
  w.s.enemies.pop();
  director(w, 0.05);
  expect(w.s.bossIndex).toBe(1);
  expect(w.s.enemies.at(-1)!.bossOrdinal).toBe(1);
});
it.each(Object.keys(MAPS) as MapId[])(
  "%s fourth scheduled boss yields victory and endless continues at wave 25",
  (map) => {
    const w = new World(
      createRun("standard", "ranger", 22, undefined, undefined, map),
    );
    w.s.wave = newWave(20, 0);
    w.s.bossIndex = 3;
    w.s.player.level = 100;
    director(w, 0.05);
    const e = w.s.enemies.find((e) => e.bossOrdinal === 4)!;
    e.hp = 0;
    w.step(0.05, input);
    expect(w.s.phase).toBe("victory");
    w.continueEndless();
    w.s.wave = newWave(25, w.s.time);
    director(w, 0.05);
    expect(w.s.bossIndex).toBe(5);
    expect(
      w.s.enemies.filter((e) => e.hp > 0 && ENEMIES[e.kind].boss),
    ).toHaveLength(1);
  },
);
it("endless schedules eight boss ordinals including the cross-map mirror", () => {
  const w = make();
  const kinds = [];
  for (let i = 1; i <= 8; i++) {
    w.s.wave = newWave(i * 5, w.s.time);
    director(w, 0.05);
    kinds.push(w.s.enemies.find((e) => ENEMIES[e.kind].boss)!.kind);
    w.s.enemies = [];
  }
  expect(w.s.bossIndex).toBe(8);
  expect(kinds[5]).toBe("mirrorMaiden");
});
it("pause and draw stop wave timers as well as spawning", () => {
  const w = make();
  w.s.phase = "upgrade";
  const before = structuredClone(w.s.wave);
  for (let i = 0; i < 100; i++) w.step(0.05, input);
  expect(w.s.wave).toEqual(before);
  expect(w.s.time).toBe(0);
});
it("mid-entry snapshot restores identical RNG, admission, bosses and deadlines", () => {
  const w = make();
  w.s.wave = newWave(5, 0);
  w.s.time = 2;
  director(w, 0.05);
  const restored = new World(validateRun(structuredClone(w.s)));
  for (let i = 0; i < 200; i++) {
    w.s.time += 0.05;
    restored.s.time += 0.05;
    director(w, 0.05);
    director(restored, 0.05);
  }
  expect(restored.s).toEqual(w.s);
  expect(restored.s.bossIndex).toBe(1);
});
it.each([1, 2] as const)(
  "schema %i explicitly migrates admitted enemies, boss identity and RNG",
  (version) => {
    const w = make();
    w.s.time = 601;
    w.s.bossIndex = 2;
    spawn(w, "witch");
    const old = structuredClone(w.s);
    old.version = version;
    delete old.wave;
    const s = validateRun(old);
    expect(s.version).toBe(5);
    expect(s.wave!.number).toBe(11);
    expect(s.wave!.status).toBe("active");
    expect(s.wave!.startedAt).toBe(601);
    expect(s.rng).toBe(old.rng);
    expect(s.enemies[0].bossOrdinal).toBe(2);
    const count = s.enemies.length;
    director(new World(s), 0.05);
    expect(s.enemies).toHaveLength(count);
    expect(s.bossIndex).toBe(2);
    expect(old.wave).toBeUndefined();
  },
);
it.each(["processed", "skipped", "duration", "number"])(
  "rejects malformed wave %s instead of silently resetting",
  (key) => {
    const w = make();
    (w.s.wave as any)[key] = -1;
    expect(() => validateRun(w.s)).toThrow();
  },
);
