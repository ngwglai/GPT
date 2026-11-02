import { describe, it, expect } from "vitest";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { spawn, director } from "../src/core/director";
import { MAPS, ENV_RULES, type MapId } from "../src/data/maps";
import { ENEMIES, LIMITS } from "../src/data/content";
import {
  advancedAI,
  behavior,
  safeLanding,
  tickDefense,
} from "../src/core/creatureAI";
import {
  addBuff,
  addCandy,
  addCrystal,
  addField,
  environment,
  hitCrystals,
  temporary,
  tickEnvironment,
} from "../src/core/environment";
import { selectTarget, frontalFactor } from "../src/core/targeting";
import { validateRun } from "../src/services/storage";
import { musicState } from "../src/services/musicPolicy";
import { distance } from "../src/core/math";
import { recalculate } from "../src/core/fate";
const w = (map: MapId = "forest") =>
  new World(createRun("endless", "ranger", 425, undefined, undefined, map));
const enemy = (
  c: World,
  kind: Parameters<typeof spawn>[1],
  x = 2000,
  y = 1800,
) => spawn(c, kind, { x, y })!;
const input = { x: 0, y: 0, aim: { x: 2100, y: 1800 } };
describe("four deterministic worlds and explicit migration", () => {
  it.each(Object.keys(MAPS) as MapId[])(
    "map %s configuration, spawn weights and environment save",
    (map) => {
      const c = w(map);
      expect(c.s.environment?.mapId).toBe(map);
      c.s.nextBoss = c.s.nextEvent = 1e9;
      c.s.time = 500;
      const seen = new Set<string>();
      for (let i = 0; i < 120; i++) {
        c.s.spawnTimer = 0;
        director(c, 0.05);
        seen.add(c.s.enemies.at(-1)!.kind);
        c.s.enemies = [];
      }
      expect(
        [...seen].every(
          (k) =>
            MAPS[map].spawns.some((x) => x.kind === k) ||
            MAPS[map].elite.includes(k as any),
        ),
      ).toBe(true);
      expect(seen.size).toBeGreaterThan(3);
      const restored = validateRun(c.s);
      expect(restored.rng).toBe(c.s.rng);
      expect(restored.environment).toEqual(c.s.environment);
      expect(
        createRun("standard", "ranger", 22, undefined, undefined, map),
      ).toEqual(createRun("standard", "ranger", 22, undefined, undefined, map));
    },
  );
  it("v1.0 / v1.1 / v1.2-v1.3 saves migrate to forest without losing cards or RNG", () => {
    for (const deck of [false, true]) {
      const s: any = structuredClone(w().s);
      s.version = 1;
      delete s.environment;
      if (!deck) {
        delete s.deck;
        delete s.fate;
      }
      const oldRng = s.rng,
        oldCards = { ...s.player.upgrades };
      const restored = validateRun(s);
      expect(restored.version).toBe(2);
      expect(restored.environment!.mapId).toBe("forest");
      expect(restored.rng).toBe(oldRng);
      for (const [id, n] of Object.entries(oldCards))
        if (id !== "weapon_bow") expect(restored.player.upgrades[id]).toBe(n);
      expect(s.version).toBe(1);
      expect(s.environment).toBeUndefined();
    }
  });
  it("rejects corrupted map states instead of silently deleting them", () => {
    const s = w("cavern").s;
    s.environment!.crystals[0].hp = NaN;
    expect(() => validateRun(s)).toThrow();
    const t = w().s;
    (t.environment as any).mapId = "missing";
    expect(() => validateRun(t)).toThrow();
  });
  it.each(["cavern", "garden", "eclipse"] as MapId[])(
    "standard final boss is map-specific: %s",
    (map) => {
      const c = w(map);
      c.s.mode = "standard";
      c.s.bossIndex = 4;
      c.s.time = 1201;
      c.s.nextBoss = 1500;
      const boss = enemy(c, MAPS[map].bosses[3]);
      boss.hp = 0;
      c.step(0.05, input);
      expect(c.s.phase).toBe("victory");
    },
  );
});
describe("bounded and persistent environmental mechanics", () => {
  it("crystals receive real projectile and area damage, bounded iterative chain and collision removal", () => {
    const c = w();
    c.s.rocks = [];
    const env = environment(c.s);
    for (let i = 0; i < 24; i++) addCrystal(c.s, { x: 150 + i * 130, y: 300 });
    const before = env.crystals.length;
    expect(before).toBe(24);
    expect(hitCrystals(c, env.crystals[0], 1, 120)).toBe(16);
    expect(env.crystals).toHaveLength(8);
    expect(env.crystals.every((x) => x.hp > 0)).toBe(true);
    expect(c.s.rocks).toHaveLength(8);
    expect(validateRun(c.s).environment!.destroyed).toHaveLength(16);
    c.s.rocks = [];
    env.crystals = [];
    const target = addCrystal(c.s, { x: 1900, y: 1800 }, "xp")!;
    c.shoot(c.s.player, { x: 1, y: 0 }, 200, "bow", "bow");
    c.projectiles(0.2);
    expect(env.destroyed).toContain(target.id);
    expect(c.s.player.xp).toBe(24);
  });
  it("candy has visible types; temporary buffs expire without altering card attributes", () => {
    const c = w("garden"),
      p = c.s.player,
      before = structuredClone(p.upgrades),
      speed = p.speed;
    addCandy(c.s, p, "speed");
    tickEnvironment(c, 0.05);
    expect(temporary(c.s, "speed")).toBe(1.25);
    expect(p.speed).toBe(speed);
    addBuff(c.s, "weak");
    addBuff(c.s, "weak");
    expect(
      environment(c.s).buffs.filter((x) => x.kind === "weak"),
    ).toHaveLength(1);
    expect(temporary(c.s, "damage")).toBe(0.8);
    const restored = validateRun(c.s);
    expect(restored.environment).toEqual(c.s.environment);
    recalculate(c.s);
    for (let i = 0; i < 180; i++) tickEnvironment(c, 0.05);
    expect(temporary(c.s, "speed")).toBe(1);
    expect(temporary(c.s, "damage")).toBe(1);
    expect(p.upgrades).toEqual(before);
  });
  it("field warnings precede damage, finite coverage and shield cap", () => {
    const c = w("eclipse"),
      p = c.s.player;
    p.invincible = 0;
    addField(c.s, p, "eclipse");
    const hp = p.hp;
    tickEnvironment(c, 0.1);
    expect(p.hp).toBe(hp);
    for (let i = 0; i < 40; i++) tickEnvironment(c, 0.05);
    expect(p.hp).toBeLessThan(hp);
    environment(c.s).fields = [];
    addField(c.s, p, "shield", 0);
    for (let i = 0; i < 160; i++) tickEnvironment(c, 0.05);
    expect(p.shield).toBeLessThanOrEqual(45);
    for (let i = 0; i < 30; i++) addField(c.s, p, "eclipse");
    expect(environment(c.s).fields.length).toBeLessThanOrEqual(
      ENV_RULES.fields,
    );
  });
});
describe("independent creature behaviors", () => {
  it("healing cannot stack from multiple fairies during the same period", () => {
    const c = w();
    c.s.rocks = [];
    const a = enemy(c, "fairy"),
      b = enemy(c, "fairy", 2010),
      target = enemy(c, "guard", 2040);
    target.hp = 20;
    a.timer = b.timer = 0;
    advancedAI(c, a, 0.05);
    const healed = target.hp;
    advancedAI(c, b, 0.05);
    expect(healed).toBeGreaterThan(20);
    expect(target.hp).toBe(healed);
    expect(a.hp).toBe(a.maxHp);
  });
  it("shield has capacity and expiry; killing its protector removes it immediately", () => {
    const c = w();
    const a = enemy(c, "protector"),
      b = enemy(c, "guard", 2020);
    a.timer = 0;
    advancedAI(c, a, 0.05);
    expect(b.behavior!.shield).toBe(35);
    a.timer = 0;
    advancedAI(c, a, 0.05);
    expect(b.behavior!.shield).toBe(35);
    tickDefense(c.s, b, 5);
    expect(b.behavior!.shield).toBe(0);
    a.timer = 0;
    advancedAI(c, a, 0.05);
    c.damage(a, 1e6, "test", false);
    expect(b.behavior!.shield).toBe(0);
  });
  it("ghost teleports only after warning, into a legal landing with cooldown", () => {
    const c = w();
    const e = enemy(c, "ghost");
    e.timer = 0;
    const before = { x: e.x, y: e.y };
    advancedAI(c, e, 0.05);
    expect(behavior(e).warning).toBeGreaterThan(0);
    expect(e.x).toBeCloseTo(before.x);
    for (let i = 0; i < 18; i++) advancedAI(c, e, 0.05);
    expect(distance(e, before)).toBeGreaterThan(10);
    expect(c.s.rocks.every((r) => distance(r, e) >= r.r + e.r - 0.01)).toBe(
      true,
    );
    expect(distance(e, c.s.player)).toBeGreaterThan(90);
    expect(e.timer).toBeGreaterThan(3);
    expect(safeLanding(c.s, c.s.player, 20)).toBeUndefined();
  });
  it("split children are limited, give no experience or draws and cannot recurse", () => {
    const c = w();
    const e = enemy(c, "splitter");
    e.hp = 0;
    c.step(0.05, input);
    const children = c.s.enemies.filter((x) => x.behavior?.child);
    expect(children).toHaveLength(2);
    expect(children.every((x) => x.behavior!.rewardless)).toBe(true);
    const gems = c.s.gems.length,
      draws = c.s.rewardDrops?.length || 0;
    for (const x of children) x.hp = 0;
    c.step(0.05, input);
    expect(c.s.enemies.filter((x) => x.kind === "splitter")).toHaveLength(0);
    expect(c.s.gems.length).toBe(gems);
    expect(c.s.rewardDrops?.length || 0).toBe(draws);
  });
  it("reflection terminates once, bounds damage, and excludes lance and area", () => {
    const c = w();
    c.s.rocks = [];
    const e = enemy(c, "mirror", 1860);
    behavior(e).reflecting = 1;
    c.grid.rebuild(c.s.enemies);
    c.shoot(c.s.player, { x: 1, y: 0 }, 1000, "bow", "bow");
    c.projectiles(0.1);
    const b = c.s.bullets[0];
    expect(b.enemy).toBe(true);
    expect(b.reflected).toBe(true);
    expect(b.damage).toBeLessThanOrEqual(12);
    expect(e.hp).toBe(e.maxHp);
    const hp = e.hp;
    c.area(e, 30, 10, "slash", "blade");
    expect(e.hp).toBeLessThan(hp);
    c.shoot(c.s.player, { x: 1, y: 0 }, 10, "lance", "lance");
    c.projectiles(0.1);
    expect(
      c.s.bullets.filter((x) => x.source === "lance").every((x) => !x.enemy),
    ).toBe(true);
  });
  it("mimic stays disguised until approach then gives warning", () => {
    const c = w(),
      e = enemy(c, "mimic", 2400);
    advancedAI(c, e, 0.1);
    expect(behavior(e).awakened).toBe(false);
    e.x = 1950;
    advancedAI(c, e, 0.05);
    expect(behavior(e).awakened).toBe(true);
    expect(e.charge).not.toBeNull();
    expect(behavior(e).warning).toBeGreaterThan(0);
  });
  it("summoners have independent 3-minion caps and share global budget", () => {
    const c = w(),
      a = enemy(c, "summoner"),
      b = enemy(c, "summoner", 2200);
    for (let i = 0; i < 10; i++) {
      a.timer = b.timer = 0;
      advancedAI(c, a, 0.05);
      advancedAI(c, b, 0.05);
    }
    expect(
      c.s.enemies.filter((x) => x.behavior?.summonOwner === a.id),
    ).toHaveLength(3);
    expect(
      c.s.enemies.filter((x) => x.behavior?.summonOwner === b.id),
    ).toHaveLength(3);
    while (c.s.enemies.length < LIMITS.enemies - 3) enemy(c, "crawler");
    a.timer = 0;
    advancedAI(c, a, 0.05);
    expect(c.s.enemies.length).toBe(LIMITS.enemies - 3);
  });
  it("hexer projectiles apply temporary effects without adding negative cards", () => {
    const c = w(),
      e = enemy(c, "hexer", 1850),
      cards = { ...c.s.player.upgrades };
    c.s.player.invincible = 0;
    e.timer = 0;
    advancedAI(c, e, 0.05);
    expect(c.s.bullets[0].status).toBe("slow");
    c.projectiles(0.2);
    expect(temporary(c.s, "speed")).toBe(0.75);
    expect(c.s.player.upgrades).toEqual(cards);
    for (let i = 0; i < 110; i++) tickEnvironment(c, 0.05);
    expect(temporary(c.s, "speed")).toBe(1);
  });
  it("butterfly has group cap and warned locked-direction dash", () => {
    const c = w();
    for (let i = 0; i < 20; i++) spawn(c, "butterfly", { x: 2100, y: 1800 });
    expect(c.s.enemies).toHaveLength(12);
    const e = c.s.enemies[0];
    e.timer = 0;
    advancedAI(c, e, 0.05);
    expect(e.charge).not.toBeNull();
    expect(behavior(e).warning).toBeGreaterThan(0);
  });
  it("crab front differs from side/back and area remains effective", () => {
    const c = w(),
      e = enemy(c, "crab");
    behavior(e).facing = 0;
    expect(frontalFactor(e, { x: e.x + 100, y: e.y })).toBe(0.35);
    expect(frontalFactor(e, { x: e.x - 100, y: e.y })).toBe(1);
    expect(frontalFactor(e)).toBe(0.8);
  });
  it("ranged targeting prioritizes reachable supports with hysteresis", () => {
    const c = w();
    c.s.rocks = [];
    const guard = enemy(c, "guard", 2000),
      fairy = enemy(c, "fairy", 2080);
    expect(selectTarget(c.s, "bow", 500)?.id).toBe(fairy.id);
    expect(selectTarget(c.s, "bow", 220)?.id).toBe(guard.id);
    c.s.rocks = [{ x: 1940, y: 1800, r: 40 }];
    expect(selectTarget(c.s, "bow", 500)).toBeUndefined();
  });
});
describe("boss phases, warning budgets and safe imitation", () => {
  it.each([
    "crystalQueen",
    "candyWitch",
    "eclipseSaint",
    "mirrorMaiden",
  ] as const)("%s changes phase with legal saved state", (kind) => {
    const c = w(
        kind === "crystalQueen"
          ? "cavern"
          : kind === "candyWitch"
            ? "garden"
            : "eclipse",
      ),
      e = enemy(c, kind, 2100);
    c.s.player.weapons = { bow: 5, blade: 5, ember: 5, orbit: 5, drone: 5 };
    e.timer = 0;
    advancedAI(c, e, 0.05);
    const first = e.timer;
    expect(c.s.zones.length).toBeGreaterThan(0);
    expect(c.s.zones.every((z) => z.delay > 0 || !z.enemy)).toBe(true);
    e.hp = e.maxHp * 0.3;
    e.timer = 0;
    advancedAI(c, e, 0.05);
    expect(e.timer).toBeLessThan(first);
    for (let i = 0; i < 10; i++) {
      e.timer = 0;
      advancedAI(c, e, 0.05);
    }
    expect(c.s.zones.length).toBeLessThanOrEqual(LIMITS.zones);
    expect(c.s.bullets.length).toBeLessThanOrEqual(LIMITS.bullets);
    expect(behavior(e).copied.length).toBeLessThanOrEqual(5);
    expect(c.s.zones.every((z) => z.damage <= e.damage)).toBe(true);
    expect(() => validateRun(c.s)).not.toThrow();
  });
});
describe("music policy independent of battle pause", () => {
  it.each(["game", "upgrade", "build", "codex"])(
    "music continues on %s, higher priorities override",
    (screen) => {
      const s = w().s;
      s.phase = screen === "upgrade" ? "upgrade" : "playing";
      expect(musicState(s, screen, false, false)).toBe("playing");
      expect(musicState(s, screen, true, false)).toBe("paused");
      expect(musicState(s, screen, false, true)).toBe("paused");
    },
  );
  it("terminal and menu stop music", () => {
    const s = w().s;
    expect(musicState(s, "home", false, false)).toBe("stopped");
    s.phase = "victory";
    expect(musicState(s, "build", false, false)).toBe("stopped");
  });
});
it("pooled bullets clear prior reflection and temporary curse metadata", () => {
  const c = w();
  c.shoot({ x: 400, y: 400 }, { x: 1, y: 0 }, 10, "enemy", "hexer", true, {
    status: "slow",
    reflected: true,
    life: 0.01,
  });
  c.projectiles(0.05);
  expect(c.bulletPool).toHaveLength(1);
  c.shoot(c.s.player, { x: 1, y: 0 }, 10, "bow", "bow");
  expect(c.s.bullets[0].status).toBeUndefined();
  expect(c.s.bullets[0].reflected).toBeUndefined();
  expect(() => validateRun(c.s)).not.toThrow();
});
it("breaking the queen's marked crystal cancels its linked attack", () => {
  const c = w("cavern");
  c.s.rocks = [];
  environment(c.s).crystals = [];
  const x = addCrystal(c.s, { x: 1960, y: 1800 })!;
  const boss = enemy(c, "crystalQueen", 2150);
  boss.timer = 0;
  advancedAI(c, boss, 0.05);
  expect(c.s.zones.some((z) => z.anchor === x.id)).toBe(true);
  hitCrystals(c, x, 1, 120);
  expect(c.s.zones.some((z) => z.anchor === x.id)).toBe(false);
  expect(() => validateRun(c.s)).not.toThrow();
});
it("target hysteresis and random state survive exact save/resume", () => {
  const c = w();
  c.s.rocks = [];
  enemy(c, "guard", 2010);
  enemy(c, "fairy", 2050);
  c.step(0.05, input);
  const restored = new World(validateRun(c.s));
  expect(restored.s.environment!.targets).toEqual(c.s.environment!.targets);
  for (let i = 0; i < 60; i++) {
    c.step(0.05, input);
    restored.step(0.05, input);
  }
  expect(restored.s).toEqual(c.s);
});
it("dash protection prevents temporary projectile debuffs", () => {
  const c = w();
  c.s.rocks = [];
  c.s.player.invincible = 0.2;
  c.shoot({ x: 1840, y: 1800 }, { x: -1, y: 0 }, 8, "enemy", "hexer", true, {
    status: "slow",
  });
  c.projectiles(0.2);
  expect(environment(c.s).buffs).toHaveLength(0);
  expect(c.s.player.hp).toBe(c.s.player.maxHp);
});
it("rewardless children preserve wildfire and harvest card interactions", () => {
  const c = w();
  c.s.rocks = [];
  c.s.player.upgrades.wildfire = 1;
  c.s.player.upgrades.harvest = 1;
  c.s.player.hp -= 5;
  const child = enemy(c, "splitter", 2200),
    target = enemy(c, "guard", 2230);
  behavior(child).child = true;
  behavior(child).rewardless = true;
  child.burn = 2;
  child.burnPower = 3;
  child.hp = 0;
  const gems = c.s.gems.length,
    hp = c.s.player.hp;
  c.step(0.05, input);
  expect(target.burn).toBeGreaterThan(0);
  expect(c.s.player.hp).toBeGreaterThan(hp);
  expect(c.s.gems.length).toBe(gems);
});
it("new chasing creatures steer around circular obstacles", () => {
  const c = w();
  c.s.rocks = [{ x: 2000, y: 1800, r: 45 }];
  const e = enemy(c, "splitter", 2080);
  const y = e.y;
  for (let i = 0; i < 30; i++) advancedAI(c, e, 0.05);
  expect(Math.abs(e.y - y)).toBeGreaterThan(5);
  expect(distance(e, c.s.rocks[0])).toBeGreaterThanOrEqual(e.r + 45 - 0.01);
});
it("ghost teleport distance stays bounded even far from the player", () => {
  for (const x of [500, 2000, 3200]) {
    const c = w();
    c.s.rocks = [];
    const e = enemy(c, "ghost", x, 2200);
    e.timer = 0;
    advancedAI(c, e, 0.05);
    const target = behavior(e).target;
    expect(target).not.toBeNull();
    expect(distance(target!, e)).toBeLessThanOrEqual(ENV_RULES.teleportRange);
    const before = { x: e.x, y: e.y };
    for (let i = 0; i < 17; i++) advancedAI(c, e, 0.05);
    expect(distance(e, before)).toBeLessThanOrEqual(
      ENV_RULES.teleportRange + 5,
    );
  }
});
it("an intact queen anchor detonates before removal while player breaking still cancels", () => {
  const c = w("cavern");
  c.s.rocks = [];
  environment(c.s).crystals = [];
  c.s.player.invincible = 0;
  const x = addCrystal(c.s, { x: 1970, y: 1800 })!;
  const q = enemy(c, "crystalQueen", 2200);
  q.timer = 0;
  advancedAI(c, q, 0.05);
  expect(c.s.zones.some((z) => z.anchor === x.id)).toBe(true);
  for (let i = 0; i < 31; i++) advancedAI(c, q, 0.05);
  expect(environment(c.s).crystals.some((y) => y.id === x.id)).toBe(false);
  expect(
    c.s.zones.some(
      (z) =>
        z.kind === "crystalChain" && z.anchor === undefined && z.delay === 0,
    ),
  ).toBe(true);
  const hp = c.s.player.hp;
  c.projectiles(0.01);
  expect(c.s.player.hp).toBeLessThan(hp);
  expect(() => validateRun(c.s)).not.toThrow();
});
