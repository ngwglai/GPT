import { expect, it } from "vitest";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { spawn, director } from "../src/core/director";
import { newWave } from "../src/core/waves";
import {
  ensureRevival,
  REVIVAL_RULES,
  rewardBossLife,
} from "../src/core/revival";
import { validateRun } from "../src/services/storage";
import {
  CharacterAnimation,
  MovementPose,
} from "../src/render/characterAnimation";
import {
  CHARACTER_ACTIONS,
  actionDuration,
} from "../src/data/characterAnimations";
const input = {
  x: 1,
  y: 0,
  aim: { x: 2100, y: 1800 },
  skills: [true, true, true],
  dash: true,
};
function make() {
  const w = new World(createRun("endless", "ranger", 1601));
  w.s.nextEvent = 99999;
  w.s.player.level = 1_000_000;
  w.s.player.invincible = 999;
  return w;
}
function die(w: World) {
  w.s.player.invincible = 0;
  w.hurt(1e9);
}
function animate(w: World, seconds: number) {
  for (let t = 0; t < seconds; t += 0.05) w.advancePresentation(0.05);
}
function earn(w: World, ordinal = w.s.bossIndex + 1) {
  w.s.bossIndex = ordinal;
  const e = spawn(w, "warden")!;
  e.bossOrdinal = ordinal;
  e.hp = 0;
  w.step(0.01, { x: 0, y: 0, aim: w.s.player });
  return e;
}
it("lethal damage enters defeat, freezes combat and does not immediately settle", () => {
  const w = make();
  die(w);
  expect(w.s.phase).toBe("dying");
  const snapshot = structuredClone(w.s);
  for (let i = 0; i < 100; i++) w.step(0.05, input);
  expect(w.s).toEqual(snapshot);
  expect(w.cast(0, input.aim)).toBe(false);
  w.hurt(10);
  expect(w.s.revival!.deaths).toBe(1);
  animate(w, REVIVAL_RULES.defeatDuration - 0.1);
  expect(w.s.phase).toBe("dying");
  animate(w, 0.4);
  expect(w.s.phase).toBe("dead");
});
it("only scheduled, reward-bearing boss deaths grant a charge once", () => {
  const w = make();
  const ordinary = spawn(w, "crawler")!;
  ordinary.hp = 0;
  expect(rewardBossLife(w.s, ordinary)).toBe(false);
  const fake = spawn(w, "warden")!;
  fake.hp = 0;
  expect(rewardBossLife(w.s, fake)).toBe(false);
  const boss = earn(w);
  expect(w.s.revival!.remaining).toBe(1);
  expect(rewardBossLife(w.s, boss)).toBe(false);
  const summoned = spawn(w, "warden")!;
  summoned.bossOrdinal = ++w.s.bossIndex;
  summoned.hp = 0;
  summoned.behavior = { rewardless: true } as any;
  expect(rewardBossLife(w.s, summoned)).toBe(false);
  expect(w.s.revival!.remaining).toBe(1);
});
it("boss credits accumulate past small UI caps and the fourth still wins", () => {
  const w = make();
  for (let i = 0; i < 110; i++) earn(w);
  expect(w.s.revival!.remaining).toBe(110);
  expect(w.s.revival!.earned).toBe(110);
  const s = make();
  s.s.mode = "standard";
  s.s.player.level = 100;
  s.s.wave = newWave(20, s.s.time);
  s.s.bossIndex = 3;
  director(s, 0.01);
  const final = s.s.enemies.find((e) => e.bossOrdinal === 4)!;
  final.hp = 0;
  s.step(0.01, { x: 0, y: 0, aim: s.s.player });
  expect(s.s.phase).toBe("victory");
  expect(s.s.revival!.remaining).toBe(1);
  s.continueEndless();
  expect(s.s.revival!.remaining).toBe(1);
});
it("revival debits once, restores half health, keeps combat and clears only nearby enemy shots", () => {
  const w = make();
  earn(w);
  w.s.phase = "playing";
  w.s.player.cooldowns = [2, 3, 4];
  const old = spawn(w, "guard")!;
  for (const [x, enemy] of [
    [1850, true],
    [2200, true],
    [1850, false],
  ] as const)
    w.shoot({ x, y: 1800 }, { x: 1, y: 0 }, 2, "enemy", "test", enemy);
  die(w);
  animate(w, 1.7);
  expect(w.s.phase).toBe("revive");
  const wave = structuredClone(w.s.wave),
    clock = w.s.time;
  expect(w.revive()).toBe(true);
  expect(w.revive()).toBe(false);
  expect(w.s.revival!.used).toBe(1);
  expect(w.s.revival!.remaining).toBe(0);
  expect(w.s.bullets).toHaveLength(2);
  expect(w.s.bullets.some((b) => !b.enemy)).toBe(true);
  expect(w.s.enemies.includes(old)).toBe(true);
  for (let i = 0; i < 20; i++) w.step(0.05, input);
  expect(w.s.time).toBe(clock);
  expect(w.s.wave).toEqual(wave);
  animate(w, 0.8);
  expect(w.s.phase).toBe("reviving");
  animate(w, 0.3);
  expect(w.s.phase).toBe("playing");
  expect(w.s.player.hp).toBe(w.s.player.maxHp * 0.5);
  expect(w.s.player.invincible).toBe(3);
  expect(w.s.player.cooldowns).toEqual([2, 3, 4]);
  expect(w.s.wave).toEqual(wave);
});
it("decline is explicit and cannot debit a charge", () => {
  const w = make();
  earn(w);
  w.s.phase = "playing";
  die(w);
  animate(w, 1.7);
  expect(w.declineRevival()).toBe(true);
  expect(w.declineRevival()).toBe(false);
  expect(w.s.phase).toBe("dead");
  expect(w.s.revival!.remaining).toBe(1);
});
it.each(["dying", "revive", "reviving"] as const)(
  "%s snapshot resumes without a second reward or debit",
  (phase) => {
    const w = make();
    earn(w);
    w.s.phase = "playing";
    die(w);
    if (phase !== "dying") animate(w, 1.7);
    if (phase === "reviving") {
      w.revive();
      animate(w, 0.3);
    }
    const snapshot = validateRun(w.s),
      copy = new World(snapshot);
    expect(copy.s.phase).toBe(phase);
    expect(copy.s.revival).toEqual(w.s.revival);
    if (phase === "reviving") {
      animate(copy, 1);
      expect(copy.s.revival!.used).toBe(1);
      expect(copy.s.phase).toBe("playing");
    }
  },
);
it("old schema3 does not award historical kills, but its live boss still earns once", () => {
  const w = make();
  w.s.bossIndex = 3;
  w.s.stats.bosses = 2;
  const boss = spawn(w, "warden")!;
  boss.bossOrdinal = 3;
  const old = structuredClone(w.s);
  old.version = 3;
  delete old.revival;
  const s = validateRun(old);
  expect(s.version).toBe(4);
  expect(ensureRevival(s).remaining).toBe(0);
  expect(s.revival!.rewardedBoss).toBe(2);
  s.enemies[0].hp = 0;
  expect(rewardBossLife(s, s.enemies[0])).toBe(true);
  expect(s.revival!.remaining).toBe(1);
});
it("animation loops and all one-shots use distinct priority and bounded frames", () => {
  const a = new CharacterAnimation(),
    events = { cast: 0, hurt: 0, dash: 0 };
  a.update(0.2, "playing", 0, false, 0, events);
  expect(a.action).toBe("idle");
  expect(a.frame()).toBe(1);
  a.update(1, "playing", 0, true, 1, events);
  expect(a.action).toBe("run");
  a.update(0.1, "playing", 0, true, -1, { ...events, cast: 1 });
  expect(a.action).toBe("cast");
  expect(a.facing).toBe(-1);
  a.update(0.1, "playing", 0, true, 0, { ...events, cast: 1, dash: 1 });
  expect(a.action).toBe("dash");
  a.update(0.1, "playing", 0, true, 0, { ...events, cast: 2, dash: 1 });
  expect(a.action).toBe("dash");
  a.update(0.1, "playing", 0, true, 0, {
    ...events,
    cast: 2,
    dash: 1,
    hurt: 1,
  });
  expect(a.action).toBe("hurt");
  a.update(1, "playing", 0, false, 0, { ...events, cast: 2, dash: 1, hurt: 1 });
  expect(a.action).toBe("idle");
  a.update(0.1, "dying", 1, false, 0, events);
  expect(a.action).toBe("defeat");
  a.update(0.1, "revive", 2, false, 0, events);
  expect(a.frame()).toBe(7);
  a.update(0.1, "reviving", 0.5, false, 0, events);
  expect(a.action).toBe("revive");
  expect(a.frame()).toBe(4);
  for (const action of Object.keys(
    CHARACTER_ACTIONS,
  ) as (keyof typeof CHARACTER_ACTIONS)[]) {
    a.action = action;
    a.elapsed = actionDuration(action) * 1000;
    expect(a.frame()).toBeGreaterThanOrEqual(0);
    expect(a.frame()).toBeLessThan(8);
  }
});
it("dash cannot shorten the three-second revival protection", () => {
  const w = make();
  earn(w);
  w.s.phase = "playing";
  die(w);
  animate(w, 1.7);
  w.revive();
  animate(w, 1.1);
  w.step(0.05, input);
  expect(w.s.player.invincible).toBeGreaterThan(2.9);
  const hp = w.s.player.hp;
  w.hurt(1e6);
  expect(w.s.player.hp).toBe(hp);
});
it("a simultaneous boss death settles once before the defeat choice", () => {
  const w = make();
  w.s.bossIndex = 1;
  const boss = spawn(w, "warden")!;
  boss.bossOrdinal = 1;
  boss.hp = 0;
  w.s.player.invincible = 0;
  w.zone(w.s.player, 80, 1e8, "meteor", true, 0, 1);
  w.step(0.05, { x: 0, y: 0, aim: w.s.player });
  expect(w.s.phase).toBe("dying");
  expect(w.s.revival!.remaining).toBe(1);
  expect(w.s.stats.bosses).toBe(1);
  animate(w, 1.7);
  expect(w.s.phase).toBe("revive");
  expect(w.s.revival!.remaining).toBe(1);
});
it("all three characters resolve seven local action sheets", async () => {
  const { CHARACTER_SHEETS } = await import("../src/data/characterAnimations");
  const { existsSync, readFileSync } = await import("node:fs");
  expect(Object.keys(CHARACTER_SHEETS)).toHaveLength(21);
  for (const [id, path] of Object.entries(CHARACTER_SHEETS)) {
    expect(id).toMatch(/^animation\.(ranger|knight|mage)\./);
    expect(existsSync("public/assets/" + path)).toBe(true);
    expect(
      readFileSync("public/assets/" + path.replace(".webp", ".gif"))
        .subarray(0, 3)
        .toString(),
    ).toBe("GIF");
  }
});
it("revival save validation rejects inconsistent or corrupt credit state", () => {
  const w = make();
  for (const bad of [NaN, Infinity, -1, 0.5]) {
    const s = structuredClone(w.s);
    s.revival!.remaining = bad;
    expect(() => validateRun(s)).toThrow();
  }
  const s = structuredClone(w.s);
  s.revival!.remaining = 1;
  expect(() => validateRun(s)).toThrow();
});
it("auto attacks never request casting; active casts do", () => {
  const w = make();
  spawn(w, "crawler", { x: 1900, y: 1800 });
  w.auto();
  expect(w.poseEvents.cast).toBe(0);
  expect(w.cast(0, { x: 2100, y: 1800 })).toBe(true);
  expect(w.poseEvents.cast).toBe(1);
});

it.each([60, 120, 144])(
  "%s Hz rendering preserves continuous run frames between 60 Hz physical steps",
  (fps) => {
    const motion = new MovementPose(),
      animation = new CharacterAnimation();
    const frames = new Set<number>();
    const events = { cast: 0, dash: 0, hurt: 0 };
    let accumulator = 0,
      x = 0,
      lastX = 0;
    for (let frame = 0; frame < fps * 2; frame++) {
      accumulator += 1 / fps;
      let simulated = false;
      while (accumulator >= 1 / 60) {
        x += 4;
        accumulator -= 1 / 60;
        simulated = true;
      }
      motion.observe(x - lastX, 0, simulated);
      lastX = x;
      animation.update(1 / fps, "playing", 0, motion.moving, motion.x, events);
      if (frame > fps / 2) {
        expect(animation.action).toBe("run");
        frames.add(animation.frame());
      }
    }
    expect(frames.size).toBe(8);
    motion.observe(0, 0, false);
    expect(motion.moving).toBe(true);
    motion.observe(0, 0, true);
    expect(motion.moving).toBe(false);
    animation.update(1 / fps, "playing", 0, motion.moving, motion.x, events);
    expect(animation.action).toBe("idle");
    motion.reset();
    expect(motion.x).toBe(0);
  },
);
