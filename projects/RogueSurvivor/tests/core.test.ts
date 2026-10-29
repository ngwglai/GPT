import { describe, it, expect } from "vitest";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { spawn, ai, director } from "../src/core/director";
import { move, closest, distance, SpatialHash } from "../src/core/math";
import {
  offer,
  applyUpgrade,
  eligible,
  damageMultiplier,
} from "../src/core/progression";
import { validateRun } from "../src/services/storage";
import { validateMeta, importPack } from "../src/services/assets";
import {
  ENEMIES,
  SKILLS,
  WEAPONS,
  UPGRADES,
  LIMITS,
  difficulty,
  xpNeeded,
} from "../src/data/content";
import type { EnemyId, SkillId, WeaponId } from "../src/core/types";
const input = { x: 0, y: 0, aim: { x: 2000, y: 1800 } };
function make() {
  return new World(createRun("standard", "ranger", 123));
}
function enemy(w: World, kind: EnemyId = "crawler", x = 1900, y = 1800) {
  const e = spawn(w, kind, { x, y })!;
  w.grid.rebuild(w.s.enemies);
  return e;
}
function upgrade(w: World, id: string) {
  w.s.phase = "upgrade";
  w.s.choices = [id];
  expect(w.choose(id)).toBe(true);
}
describe("movement and collision", () => {
  it("normalizes diagonal speed", () => {
    const a = make(),
      b = make();
    a.step(0.05, { ...input, x: 1 });
    b.step(0.05, { ...input, x: 1, y: 1 });
    expect(distance(a.s.player, { x: 1800, y: 1800 })).toBeCloseTo(
      distance(b.s.player, { x: 1800, y: 1800 }),
      8,
    );
  });
  it("slides out of circular obstacles and respects world boundaries", () => {
    const p = { x: 100, y: 100 };
    move(p, 30, 0, 16, [{ x: 140, y: 100, r: 20 }]);
    expect(distance(p, { x: 140, y: 100 })).toBeCloseTo(36);
    move(p, -500, -500, 16, []);
    expect(p).toEqual({ x: 16, y: 16 });
  });
  it("dash accelerates movement, grants invulnerability, cannot repeat on cooldown", () => {
    const w = make();
    w.s.player.invincible = 0;
    w.step(0.05, { ...input, x: 1, dash: true });
    expect(w.s.player.x).toBeGreaterThan(1830);
    const hp = w.s.player.hp;
    w.hurt(99);
    expect(w.s.player.hp).toBe(hp);
    w.step(0.05, { ...input, dash: true });
    expect(w.s.player.dashCd).toBeLessThan(2.7);
  });
  it("ignores invalid timesteps and caps delayed frames", () => {
    const w = make();
    w.step(NaN, input);
    w.step(-1, input);
    expect(w.s.time).toBe(0);
    w.step(100, input);
    expect(w.s.time).toBe(0.05);
  });
  it("pauses every simulation system during rewards", () => {
    const w = make();
    offer(w.s);
    const before = JSON.stringify(w.s);
    w.step(0.05, { ...input, x: 1, skills: [true, true, true] });
    expect(JSON.stringify(w.s)).toBe(before);
  });
});
describe("weapons and active skills", () => {
  it("selects nearest living target within range", () => {
    const p = { x: 0, y: 0 },
      targets = [
        { x: 2, y: 0, hp: 0 },
        { x: 8, y: 0, hp: 5 },
        { x: 4, y: 0, hp: 1 },
      ];
    expect(closest(p, targets, 6)).toBe(targets[2]);
    expect(closest(p, targets, 3)).toBeUndefined();
  });
  it.each(Object.keys(WEAPONS) as WeaponId[])(
    "%s automatically damages an enemy",
    (id) => {
      const w = make();
      w.s.player.weapons = { [id]: 1 };
      w.s.player.weaponTimers[id] = 0;
      const e = enemy(w, "guard", id === "orbit" ? 1895 : 1870);
      w.auto(0.05);
      for (let i = 0; i < 30; i++) w.projectiles(0.05);
      expect(e.hp).toBeLessThan(e.maxHp);
    },
  );
  it.each(Object.keys(SKILLS) as SkillId[])(
    "%s cooldown blocks repeated casts",
    (id) => {
      const w = make();
      w.s.player.skills[0] = id;
      expect(w.cast(0, input.aim)).toBe(true);
      expect(w.s.player.cooldowns[0]).toBe(SKILLS[id].cooldown);
      expect(w.cast(0, input.aim)).toBe(false);
      w.step(0.05, input);
      expect(w.s.player.cooldowns[0]).toBeLessThan(SKILLS[id].cooldown);
    },
  );
  it("directional lance pierces enemies, continuous collision prevents tunneling", () => {
    const w = make();
    w.s.player.skills[0] = "lance";
    const e = enemy(w, "guard", 1850),
      f = enemy(w, "guard", 1910);
    w.cast(0, input.aim);
    for (let i = 0; i < 4; i++) w.projectiles(0.05);
    expect(e.hp).toBeLessThan(e.maxHp);
    expect(f.hp).toBeLessThan(f.maxHp);
  });
  it("area spells clamp to cast range", () => {
    const w = make();
    w.cast(0, { x: 1e8, y: 1800 });
    expect(distance(w.s.zones[0], w.s.player)).toBeCloseTo(450);
  });
  it("shield absorbs damage before health and invulnerability blocks repeats", () => {
    const w = make();
    w.s.player.invincible = 0;
    w.s.player.shield = 20;
    w.hurt(30);
    expect(w.s.player.hp).toBe(100);
    expect(w.s.stats.taken).toBe(10);
    w.hurt(30);
    expect(w.s.player.hp).toBe(100);
  });
  it("freezing stops movement; burn damage continues during freeze", () => {
    const w = make(),
      e = enemy(w);
    e.freeze = 2;
    w.burn(e, 10, "fire");
    const x = e.x;
    ai(w, 0.05);
    expect(e.x).toBe(x);
    expect(e.hp).toBeLessThan(e.maxHp);
  });
  it("critical and frozen-target synergy increase actual damage", () => {
    const w = make(),
      e = enemy(w, "warden");
    w.s.player.crit = 1;
    w.s.player.upgrades.shatter = 1;
    e.freeze = 1;
    w.damage(e, 10, "bow");
    expect(e.maxHp - e.hp).toBeCloseTo(26);
    expect(w.s.stats.bySource.bow).toBeCloseTo(26);
  });
  it("kills credit XP gems and damage never overcounts overkill", () => {
    const w = make(),
      e = enemy(w);
    w.damage(e, 1e8, "bow");
    expect(w.s.stats.damage).toBe(e.maxHp);
    w.step(0.05, input);
    expect(w.s.stats.kills).toBe(1);
    expect(w.s.gems.length).toBe(1);
  });
  it("burning death spreads fire without recursive kill callbacks", () => {
    const w = make(),
      e = enemy(w),
      other = enemy(w, "guard", 1920);
    w.s.player.upgrades.wildfire = 1;
    w.burn(e, 5, "fire");
    w.damage(e, 1000, "bow");
    w.step(0.05, input);
    expect(other.burn).toBeGreaterThan(0);
  });
  it("storm clears hostile bullets", () => {
    const w = make();
    w.shoot({ x: 2200, y: 1800 }, { x: -1, y: 0 }, 10, "enemy", "enemy", true);
    w.cast(2, input.aim);
    w.projectiles(0.05);
    expect(w.s.bullets.filter((b) => b.enemy)).toHaveLength(0);
  });
});
describe("builds and rewards", () => {
  it("seeded offers are deterministic, weighted, unique and eligible", () => {
    const a = make(),
      b = make();
    offer(a.s);
    offer(b.s);
    expect(a.s.choices).toEqual(b.s.choices);
    expect(new Set(a.s.choices).size).toBe(3);
    expect(
      a.s.choices.every((id) => eligible(a.s).some((u) => u.id === id)),
    ).toBe(true);
  });
  it("enforces prerequisite and mutual exclusion in both directions", () => {
    const w = make();
    upgrade(w, "split");
    expect(eligible(w.s).some((u) => u.id === "pierce")).toBe(false);
    expect(eligible(w.s).some((u) => u.id === "wide")).toBe(false);
    const v = make();
    upgrade(v, "pierce");
    expect(eligible(v.s).some((u) => u.id === "split")).toBe(false);
  });
  it("allows only three weapon families and keeps them at five levels", () => {
    const w = make();
    upgrade(w, "weapon_blade");
    upgrade(w, "weapon_orbit");
    expect(eligible(w.s).some((u) => u.id === "weapon_drone")).toBe(false);
    for (let i = 0; i < 4; i++) upgrade(w, "weapon_bow");
    expect(w.s.player.weapons.bow).toBe(5);
    expect(eligible(w.s).some((u) => u.id === "weapon_bow")).toBe(false);
  });
  it("split generates fragments that cannot split recursively", () => {
    const w = make();
    w.s.player.upgrades.split = 1;
    enemy(w, "guard", 1850);
    w.auto(0.05);
    w.projectiles(0.1);
    expect(w.s.bullets.filter((b) => b.kind === "fragment")).toHaveLength(3);
    expect(
      w.s.bullets.filter((b) => b.kind === "fragment").every((b) => !b.split),
    ).toBe(true);
  });
  it("rejects out-of-offer upgrades", () => {
    const w = make();
    offer(w.s);
    expect(applyUpgrade(w.s, "invalid")).toBe(false);
  });
  it("multi-level experience is queued and never lost", () => {
    const w = make();
    w.s.player.xp = xpNeeded(1) + xpNeeded(2) + 1;
    w.step(0.05, input);
    expect(w.s.player.level).toBe(2);
    w.choose(w.s.choices[0]);
    expect(w.s.player.level).toBe(3);
    expect(w.s.phase).toBe("upgrade");
  });
  it("late mastery is unbounded with logarithmic, finite damage growth", () => {
    const w = make();
    w.s.player.level = 100;
    w.s.player.upgrades.ascend = 1e9;
    expect(eligible(w.s).some((u) => u.id === "ascend")).toBe(true);
    expect(damageMultiplier(w.s)).toBeLessThan(10);
    expect(Number.isFinite(xpNeeded(1e9))).toBe(true);
  });
  it("fifth level changes bow behavior by adding a projectile", () => {
    const w = make();
    enemy(w);
    w.s.player.weapons.bow = 5;
    w.auto(0.05);
    expect(w.s.bullets).toHaveLength(2);
  });
});
describe("director, enemies and victory", () => {
  it.each(Object.keys(ENEMIES) as EnemyId[])(
    "%s has finite movement and attack state",
    (kind) => {
      const w = make();
      enemy(w, kind, 2050);
      for (let i = 0; i < 120; i++) {
        ai(w, 0.05);
        w.projectiles(0.05);
      }
      expect(
        w.s.enemies.every((e) => Number.isFinite(e.x) && Number.isFinite(e.hp)),
      ).toBe(true);
    },
  );
  it("ranged AI shoots and seer telegraphs damage", () => {
    const w = make();
    const a = enemy(w, "archer", 2100);
    a.timer = 0;
    ai(w, 0.05);
    expect(w.s.bullets.some((b) => b.enemy)).toBe(true);
    const seer = enemy(w, "seer", 2150);
    seer.timer = 0;
    ai(w, 0.05);
    expect(w.s.zones.some((z) => z.enemy && z.delay >= 1)).toBe(true);
  });
  it("local obstacle avoidance makes progress around a boulder", () => {
    const w = make();
    w.s.rocks = [{ x: 1900, y: 1800, r: 45 }];
    const e = enemy(w, "crawler", 2050);
    for (let i = 0; i < 150; i++) ai(w, 0.05);
    expect(distance(e, w.s.player)).toBeLessThan(100);
  });
  it("spawn caps reserve boss capacity and never remove living enemies", () => {
    const w = make();
    for (let i = 0; i < 500; i++) spawn(w, "crawler");
    const ids = w.s.enemies.map((e) => e.id);
    expect(ids.length).toBe(LIMITS.enemies - 3);
    w.s.time = 300;
    director(w, 0.05);
    expect(w.s.enemies.some((e) => ENEMIES[e.kind].boss)).toBe(true);
    expect(ids.every((id) => w.s.enemies.some((e) => e.id === id))).toBe(true);
  });
  it("four standard bosses at 5,10,15,20 minutes lead to victory then endless", () => {
    const w = make();
    for (let i = 1; i <= 4; i++) {
      w.s.time = i * 300;
      director(w, 0.05);
      const boss = w.s.enemies.find((e) => ENEMIES[e.kind].boss)!;
      expect(boss).toBeDefined();
      w.grid.rebuild(w.s.enemies);
      w.damage(boss, 1e8, "storm");
      w.step(0.05, input);
      while (w.s.phase === "upgrade") w.choose(w.s.choices[0]);
    }
    expect(w.s.phase).toBe("victory");
    expect(w.s.stats.bosses).toBe(4);
    w.continueEndless();
    expect(w.s.mode).toBe("endless");
    while (w.s.phase === "upgrade") w.choose(w.s.choices[0]);
    expect(w.s.phase).toBe("playing");
    expect(w.s.nextBoss).toBeGreaterThan(w.s.time);
  });
  it("endless cycles boss families and increases composition without unbounded speed", () => {
    const w = new World(createRun("endless"));
    for (let i = 1; i <= 8; i++) {
      w.s.time = i * 300;
      director(w, 0.05);
      expect(w.s.enemies.some((e) => ENEMIES[e.kind].boss)).toBe(true);
      w.s.enemies = [];
    }
    expect(difficulty(7200).elite).toBeGreaterThan(difficulty(1200).elite);
    expect(difficulty(1e12).speed).toBeLessThanOrEqual(1.6);
  });
  it("danger zones do not damage until the full telegraph completes", () => {
    const w = make();
    w.s.player.invincible = 0;
    w.zone(w.s.player, 80, 20, "meteor", true, 1, 0.2);
    for (let i = 0; i < 19; i++) w.projectiles(0.05);
    expect(w.s.player.hp).toBe(110);
    w.projectiles(0.05);
    w.projectiles(0.05);
    expect(w.s.player.hp).toBe(90);
  });
  it("player death stops the run", () => {
    const w = make();
    w.s.player.invincible = 0;
    w.hurt(999);
    expect(w.s.phase).toBe("dead");
    const t = w.s.time;
    w.step(0.05, input);
    expect(w.s.time).toBe(t);
  });
});
describe("persistence and adversarial inputs", () => {
  it("full snapshot resumes deterministically including random state and cooldowns", () => {
    const a = make();
    for (let i = 0; i < 100; i++) a.step(0.05, { ...input, x: 1 });
    const b = new World(validateRun(JSON.parse(JSON.stringify(a.s))));
    for (let i = 0; i < 100; i++) {
      a.step(0.05, { ...input, y: 1 });
      b.step(0.05, { ...input, y: 1 });
    }
    expect(b.s).toEqual(a.s);
  });
  it.each(["version", "player", "enemies", "stats", "choices"])(
    "rejects missing %s",
    (key) => {
      const s: any = createRun("standard");
      delete s[key];
      expect(() => validateRun(s)).toThrow();
    },
  );
  it.each([NaN, Infinity, -Infinity, 1e15])(
    "rejects invalid number %s",
    (n) => {
      const s = createRun("standard");
      s.player.hp = n;
      expect(() => validateRun(s)).toThrow();
    },
  );
  it("rejects oversized collections, unknown content, invalid levels and prototypes", () => {
    const a = createRun("standard");
    a.gems = Array.from({ length: 181 }, () => ({ x: 0, y: 0, value: 1 }));
    expect(() => validateRun(a)).toThrow();
    const b = createRun("standard");
    (b.player.skills as string[])[0] = "script";
    expect(() => validateRun(b)).toThrow();
    const c = createRun("standard");
    c.player.skillLevels.fire = 900;
    expect(() => validateRun(c)).toThrow();
    const d = JSON.parse(JSON.stringify(createRun("standard")));
    d.player.upgrades = JSON.parse('{"__proto__":1}');
    expect(() => validateRun(d)).toThrow();
  });
  it("validates budget-bounded real snapshots at active combat", () => {
    const w = make();
    for (let i = 0; i < 100; i++) w.step(0.05, input);
    expect(() => validateRun(w.s)).not.toThrow();
  });
  it("validates only raster image data URLs and bounded transforms", () => {
    expect(() =>
      validateMeta({
        data: "data:image/svg+xml;base64,AAAA",
        scale: 1,
        x: 0,
        y: 0,
      }),
    ).toThrow();
    expect(() =>
      validateMeta({
        data: "data:image/png;base64,AAAA",
        scale: Infinity,
        x: 0,
        y: 0,
      }),
    ).toThrow();
    expect(() =>
      validateMeta({
        data: "data:image/png;base64,AAAA",
        scale: 1,
        x: 0,
        y: 0,
        frames: 999,
        frameWidth: 1,
        frameHeight: 1,
        fps: 10,
      }),
    ).toThrow();
  });
});
describe("resource budgets", () => {
  it("caps projectiles, zones, particles and reuses dead projectile objects", () => {
    const w = make();
    for (let i = 0; i < 1000; i++) {
      w.shoot(w.s.player, { x: 1, y: 0 }, 1, "bow", "bow");
      w.zone(w.s.player, 1, 1, "ice", false);
      w.effect(w.s.player, "fire");
    }
    expect(w.s.bullets.length).toBe(LIMITS.bullets);
    expect(w.s.zones.length).toBe(LIMITS.zones);
    expect(w.effects.length).toBe(LIMITS.effects);
    const first = w.s.bullets[0];
    for (const b of w.s.bullets) b.life = 0;
    w.projectiles(0.05);
    expect(w.bulletPool).toContain(first);
    w.shoot(w.s.player, { x: 1, y: 0 }, 1, "bow", "bow");
    expect(w.bulletPool.length).toBe(LIMITS.bullets - 1);
  });
  it("spatial hash finds all nearby objects", () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
        x: i * 17,
        y: i * 11,
      })),
      grid = new SpatialHash<(typeof items)[number]>();
    grid.rebuild(items);
    const p = { x: 340, y: 220 };
    const candidates = grid.nearby(p, 120);
    expect(
      items
        .filter((x) => distance(x, p) < 120)
        .every((x) => candidates.includes(x)),
    ).toBe(true);
  });
  it("gem cap merges experience without deleting reward value", () => {
    const w = make();
    w.s.gems = Array.from({ length: 180 }, (_, i) => ({
      x: 10 + i,
      y: 10,
      value: 1,
    }));
    const e = enemy(w, "crawler", 2300);
    w.damage(e, 1000, "bow");
    w.step(0.05, input);
    expect(w.s.gems.length).toBe(180);
    expect(w.s.gems.reduce((n, g) => n + g.value, 0)).toBe(185);
  });
});

describe("defensive regression checks", () => {
  it("rejects inherited identifiers and stringified numeric fields in saves", () => {
    const s: any = createRun("standard");
    s.player.skills[0] = "toString";
    expect(() => validateRun(s)).toThrow();
    const other: any = createRun("standard");
    other.eventUntil = "30";
    expect(() => validateRun(other)).toThrow();
  });
  it("reserves hostile projectile and zone budgets for player actions", () => {
    const w = make();
    for (let i = 0; i < 1000; i++) {
      w.shoot(w.s.player, { x: 1, y: 0 }, 1, "enemy", "enemy", true);
      w.zone(w.s.player, 30, 10, "meteor", true);
    }
    expect(w.s.bullets.length).toBe(LIMITS.bullets - 96);
    expect(w.s.zones.length).toBe(LIMITS.zones - 16);
    expect(w.cast(2, input.aim)).toBe(true);
    expect(w.s.zones.length).toBeGreaterThan(LIMITS.zones - 16);
  });
  it("budget denial does not consume active skill cooldown", () => {
    const w = make();
    for (let i = 0; i < LIMITS.zones; i++)
      w.zone(w.s.player, 30, 1, "fire", false);
    expect(w.cast(0, input.aim)).toBe(false);
    expect(w.s.player.cooldowns[0]).toBe(0);
    expect(w.s.event).toContain("未消耗冷却");
    expect(w.cast(99, input.aim)).toBe(false);
    expect(w.cast(0, { x: NaN, y: 0 })).toBe(false);
  });
});

it("reports malformed resource JSON in Chinese before decoding images", async () => {
  await expect(importPack("{bad")).rejects.toThrow("有效的 JSON");
});
