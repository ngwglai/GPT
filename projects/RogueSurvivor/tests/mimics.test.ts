import { describe, it, expect } from "vitest";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { spawn } from "../src/core/director";
import { behavior, advancedAI } from "../src/core/creatureAI";
import { canStartMimicEscape, tickMimicEscapes } from "../src/core/mimics";
import { newWave, prepareRest, waveRemaining } from "../src/core/waves";
import { addCandy, temporary, tickEnvironment } from "../src/core/environment";
import { validateRun } from "../src/services/storage";
import { MIMIC_RULES } from "../src/data/mimics";
import { ENV_RULES, type MapId } from "../src/data/maps";
import type { EnemyId } from "../src/core/types";

const input = { x: 0, y: 0, aim: { x: 2300, y: 1800 } };
function setup(map: MapId = "garden", seed = 182) {
  const c = new World(
    createRun("endless", "ranger", seed, undefined, undefined, map),
  );
  c.s.time = 35;
  c.s.wave = newWave(1, 0);
  Object.assign(c.s.wave, {
    processed: c.s.wave.budget,
    spawned: c.s.wave.budget,
    status: "active",
    announced: true,
  });
  c.s.nextEvent = 9999;
  c.s.environment!.nextCandy = 30;
  c.s.rocks = [];
  for (const k of Object.keys(c.s.player.weaponTimers))
    c.s.player.weaponTimers[k as keyof typeof c.s.player.weaponTimers] = 100;
  return c;
}
const add = (c: World, kind: EnemyId = "mimic", x = 2400) =>
  spawn(c, kind, { x, y: 1800 })!;
function seconds(c: World, t: number) {
  for (let i = 0; i < Math.round(t / 0.05); i++) c.step(0.05, input);
}

describe("garden mimic escape eligibility", () => {
  it.each(["crawler", "summoner", "splitter", "warden"] as EnemyId[])(
    "does not start with unresolved %s",
    (kind) => {
      const c = setup(),
        e = add(c);
      add(c, kind);
      tickMimicEscapes(c, 0.05);
      expect(canStartMimicEscape(c.s)).toBe(false);
      expect(e.behavior?.escapeRemaining).toBeUndefined();
    },
  );
  it("waits for all ordinary admissions and all pending boss ordinals", () => {
    const c = setup(),
      e = add(c);
    c.s.wave!.processed--;
    tickMimicEscapes(c, 0.05);
    expect(e.behavior?.escapeRemaining).toBeUndefined();
    c.s.wave!.processed++;
    c.s.wave!.number = 5;
    tickMimicEscapes(c, 0.05);
    expect(e.behavior?.escapeRemaining).toBeUndefined();
    c.s.bossIndex = 1;
    tickMimicEscapes(c, 0.05);
    expect(e.behavior?.escapeRemaining).toBeGreaterThanOrEqual(0.8);
  });
  it("an awakened mimic prevents new timers, but does not cancel existing ones", () => {
    const c = setup(),
      a = add(c),
      b = add(c),
      d = add(c);
    behavior(a).awakened = true;
    tickMimicEscapes(c, 0.05);
    expect(b.behavior?.escapeRemaining).toBeUndefined();
    behavior(a).awakened = false;
    tickMimicEscapes(c, 0.05);
    behavior(a).awakened = true;
    const before = behavior(b).escapeRemaining!;
    add(c, "crawler");
    tickMimicEscapes(c, 0.1);
    expect(behavior(b).escapeRemaining).toBeCloseTo(before - 0.1);
    expect(behavior(d).escapeRemaining).toBeDefined();
  });
  it.each(["forest", "cavern", "eclipse"] as MapId[])(
    "leaves %s legacy activation and rewards unchanged",
    (map) => {
      const c = setup(map),
        e = add(c);
      tickMimicEscapes(c, 2);
      expect(e.behavior?.escapeRemaining).toBeUndefined();
      c.damage(e, 1, "bow", false);
      expect(e.behavior?.awakened).toBeFalsy();
      advancedAI(c, e, 0.05);
      expect(behavior(e).awakened).toBe(true);
      expect(c.s.environment!.candies).toHaveLength(0);
    },
  );
  it("does not change the empty-arena five-second rest", () => {
    const c = setup();
    expect(canStartMimicEscape(c.s)).toBe(false);
    prepareRest(c);
    expect(c.s.wave!.status).toBe("resting");
    expect(waveRemaining(c.s)).toBe(5);
  });
});

describe("independent seeded escape and removal, never a death", () => {
  it("initializes once with fractional independent 0.8–2s timers, reproducible after reload", () => {
    const c = setup();
    const all = Array.from({ length: 40 }, () => add(c));
    tickMimicEscapes(c, 0.05);
    const times = all.map((e) => behavior(e).escapeRemaining!);
    expect(times.every((t) => t >= 0.8 && t <= 2 && t % 1 !== 0)).toBe(true);
    expect(new Set(times).size).toBe(40);
    const saved = structuredClone(c.s),
      restored = new World(validateRun(saved));
    const rng = c.s.rng;
    tickMimicEscapes(c, 0.1);
    expect(c.s.rng).toBe(rng);
    expect(behavior(all[0]).escapeRemaining).toBeCloseTo(times[0] - 0.1);
    tickMimicEscapes(restored, 0.1);
    seconds(c, 2);
    seconds(restored, 2);
    expect(restored.s).toEqual(c.s);
    expect(c.s.environment!.candies).toHaveLength(40);
  });
  it("only gives one candy at the original position, with no kill/XP/drop/core/revival reward", () => {
    const c = setup(),
      e = add(c, "mimic", 70);
    e.y = 50; // a valid border position must not be clamped like ambient spawns
    const initial = {
      kills: c.s.stats.kills,
      xp: c.s.player.xp,
      revival: structuredClone(c.s.revival),
    };
    seconds(c, 2.1);
    expect(c.s.enemies).toHaveLength(0);
    expect(c.s.environment!.candies).toEqual([
      expect.objectContaining({ x: e.x, y: e.y, mimicReward: true }),
    ]);
    expect(c.s.stats.kills).toBe(initial.kills);
    expect(c.s.player.xp).toBe(initial.xp);
    expect(c.s.gems).toHaveLength(0);
    expect(c.s.rewardDrops || []).toHaveLength(0);
    expect(c.s.revival).toEqual(initial.revival);
    expect(c.s.wave!.status).toBe("resting");
    const left = waveRemaining(c.s);
    seconds(c, 0.2);
    expect(c.s.environment!.candies).toHaveLength(1);
    expect(c.s.wave!.status).toBe("resting");
    expect(waveRemaining(c.s)).toBeCloseTo(left - 0.2);
  });
  it("upgrade, defeat, revive, victory states freeze the simulation and RNG", () => {
    const c = setup(),
      e = add(c);
    seconds(c, 0.05);
    for (const phase of [
      "upgrade",
      "dying",
      "revive",
      "reviving",
      "dead",
      "victory",
    ] as const) {
      c.s.phase = phase;
      const before = structuredClone(c.s);
      c.step(0.05, input);
      expect(c.s).toEqual(before);
    }
    expect(behavior(e).escapeRemaining).toBeDefined();
  });
  it("countdowns continue through freeze without erasing the enemy before completion", () => {
    const c = setup(),
      e = add(c);
    e.freeze = 5;
    seconds(c, 0.05);
    seconds(c, 0.5);
    expect(c.s.enemies).toHaveLength(1);
    expect(c.s.wave!.status).toBe("active");
    seconds(c, 1.6);
    expect(c.s.enemies).toHaveLength(0);
    expect(c.s.environment!.candies).toHaveLength(1);
  });
});

describe("interception is local and uses original wake behavior", () => {
  it("proximity before deadline cancels only that mimic, including while frozen", () => {
    const c = setup(),
      a = add(c),
      b = add(c);
    tickMimicEscapes(c, 0.05);
    behavior(a).escapeRemaining = 0.01;
    a.freeze = 2;
    a.x = c.s.player.x + 189;
    tickMimicEscapes(c, 0.05);
    expect(behavior(a).awakened).toBe(true);
    expect(behavior(a).escapeRemaining).toBeUndefined();
    expect(a.charge).not.toBeNull();
    expect(behavior(a).warning).toBe(0.7);
    tickMimicEscapes(c, 2);
    expect(c.s.enemies).toEqual([a]);
    expect(c.s.environment!.candies).toHaveLength(1);
    expect(b.hp).toBeGreaterThan(0);
  });
  it("a shield-absorbed player hit immediately awakens before the last timer tick", () => {
    const c = setup(),
      a = add(c),
      b = add(c);
    tickMimicEscapes(c, 0.05);
    behavior(a).escapeRemaining = 0.01;
    behavior(a).shield = 35;
    c.damage(a, 1, "bow", false);
    expect(a.hp).toBe(a.maxHp);
    expect(behavior(a).awakened).toBe(true);
    expect(behavior(a).escapeRemaining).toBeUndefined();
    tickMimicEscapes(c, 2);
    expect(c.s.enemies).toEqual([a]);
    expect(c.s.environment!.candies).toHaveLength(1);
    expect(c.s.stats.kills).toBe(0);
    expect(b.hp).toBeGreaterThan(0);
  });
  it("intercepted kills retain the original death rewards and never add escape candy", () => {
    const c = setup(),
      e = add(c);
    tickMimicEscapes(c, 0.05);
    c.damage(e, 1e6, "bow", false);
    c.step(0.05, input);
    expect(c.s.stats.kills).toBe(1);
    expect(c.s.gems.reduce((n, g) => n + g.value, 0)).toBeGreaterThan(0);
    expect(c.s.environment!.candies).toHaveLength(0);
  });
  it("a real projectile hit in the expiry frame wins over escape", () => {
    const c = setup(),
      e = add(c, "mimic", 2050);
    behavior(e).escapeRemaining = 0.01;
    c.shoot({ x: e.x - 5, y: e.y }, { x: 1, y: 0 }, 1, "bow", "bow");
    c.step(0.05, input);
    expect(behavior(e).awakened).toBe(true);
    expect(behavior(e).escapeRemaining).toBeUndefined();
    expect(c.s.environment!.candies).toHaveLength(0);
  });
});

describe("existing positive candy effects, capacity and save safety", () => {
  it("all four uniform positive results occur, with no negative kinds or duplicate IDs", () => {
    const c = setup();
    for (let i = 0; i < 300; i++) add(c);
    tickMimicEscapes(c, 0.05);
    tickMimicEscapes(c, 2);
    const candies = c.s.environment!.candies;
    expect(candies).toHaveLength(300);
    expect([...new Set(candies.map((x) => x.kind))].sort()).toEqual(
      [...MIMIC_RULES.positiveCandies].sort(),
    );
    expect(new Set(candies.map((x) => x.id)).size).toBe(300);
    expect(validateRun(c.s).environment!.candies).toEqual(candies);
  });
  it.each(MIMIC_RULES.positiveCandies)(
    "%s is collected through the original effect code",
    (kind) => {
      const c = setup();
      c.s.player.hp = 20;
      const hp = c.s.player.hp,
        xp = c.s.player.xp;
      expect(addCandy(c.s, c.s.player, kind, true)).toBeDefined();
      tickEnvironment(c, 0.05);
      expect(c.s.environment!.candies).toHaveLength(0);
      if (kind === "heal") expect(c.s.player.hp).toBe(hp + 25);
      if (kind === "xp") expect(c.s.player.xp).toBe(xp + 18);
      if (kind === "speed") expect(temporary(c.s, "speed")).toBe(1.25);
      if (kind === "haste") expect(temporary(c.s, "interval")).toBe(1.25);
      if (kind === "speed" || kind === "haste") {
        addCandy(c.s, c.s.player, kind, true);
        tickEnvironment(c, 0.05);
        expect(
          c.s.environment!.buffs.filter((x) => x.kind === kind),
        ).toHaveLength(1);
        expect(c.s.environment!.buffs[0].life).toBe(ENV_RULES.buffTime);
      }
    },
  );
  it("a full ambient pool cannot lose rewards; extreme reward saturation defers removal atomically", () => {
    const c = setup();
    for (let i = 0; i < ENV_RULES.candies; i++)
      addCandy(c.s, { x: 100, y: 100 }, "slow");
    for (let i = 0; i < MIMIC_RULES.rewardCapacity; i++)
      addCandy(c.s, { x: 200, y: 200 }, "xp", true);
    const e = add(c);
    behavior(e).escapeRemaining = 0.01;
    const rng = c.s.rng;
    tickMimicEscapes(c, 0.05);
    expect(c.s.enemies).toContain(e);
    expect(c.s.rng).toBe(rng);
    expect(behavior(e).escapeRemaining).toBe(0);
    expect(validateRun(c.s).environment!.candies).toHaveLength(812);
    c.s.environment!.candies.pop();
    tickMimicEscapes(c, 0.05);
    expect(c.s.enemies).toHaveLength(0);
    expect(c.s.environment!.candies).toHaveLength(812);
    tickMimicEscapes(c, 0.05);
    expect(c.s.environment!.candies).toHaveLength(812);
  });
  it("escaped candy persists through five-second rest and the following wave", () => {
    const c = setup();
    add(c);
    seconds(c, 2.1);
    prepareRest(c);
    const candy = structuredClone(c.s.environment!.candies[0]);
    const restored = new World(validateRun(c.s));
    seconds(restored, 5.1);
    expect(restored.s.wave!.number).toBe(2);
    expect(restored.s.environment!.candies).toContainEqual(
      expect.objectContaining({
        id: candy.id,
        x: candy.x,
        y: candy.y,
        kind: candy.kind,
      }),
    );
    expect(restored.s.stats.kills).toBe(0);
    expect(restored.s.environment!.candies[0].life).toBeGreaterThan(20);
  });
  it("legacy saves without escape fields load with no retroactive timer or reward", () => {
    const c = setup(),
      e = add(c);
    behavior(e);
    const rng = c.s.rng;
    const s = validateRun(c.s);
    expect(s.version).toBe(5);
    expect(s.rng).toBe(rng);
    expect(s.enemies[0].behavior!.escapeRemaining).toBeUndefined();
    expect(s.environment!.candies).toHaveLength(0);
    const restored = new World(s);
    seconds(restored, 0.05);
    expect(
      restored.s.enemies[0].behavior!.escapeRemaining,
    ).toBeGreaterThanOrEqual(0.8);
  });
  it.each([-0.1, 2.01, NaN, Infinity, "1"])(
    "rejects corrupted escape time %s",
    (value) => {
      const c = setup(),
        e = add(c);
      (behavior(e) as any).escapeRemaining = value;
      expect(() => validateRun(c.s)).toThrow();
    },
  );
  it("rejects contradictory awake/escape state, foreign-map rewards, negative reward kinds and duplicate IDs", () => {
    const c = setup(),
      e = add(c);
    behavior(e).escapeRemaining = 1;
    behavior(e).awakened = true;
    expect(() => validateRun(c.s)).toThrow();
    behavior(e).awakened = false;
    addCandy(c.s, { x: 100, y: 100 }, "xp", true);
    c.s.environment!.candies[0].kind = "slow";
    expect(() => validateRun(c.s)).toThrow();
    c.s.environment!.candies[0].kind = "xp";
    c.s.environment!.candies.push({ ...c.s.environment!.candies[0] });
    expect(() => validateRun(c.s)).toThrow();
    c.s.environment!.candies.pop();
    c.s.environment!.mapId = "forest";
    expect(() => validateRun(c.s)).toThrow();
  });
});
