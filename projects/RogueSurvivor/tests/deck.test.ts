import { it, expect, describe } from "vitest";
import { createRun } from "../src/core/create";
import { ensureDeck, heldLayers } from "../src/core/deckState";
import {
  grant,
  applyUpgrade,
  checkLevel,
  cardDescription,
} from "../src/core/progression";
import { offer, eligible, refresh } from "../src/core/cardPool";
import {
  recalculate,
  addCurse,
  cleanse,
  modifier,
  fate,
} from "../src/core/fate";
import { shuffleDeck, SHUFFLE_RANDOM_BUDGET } from "../src/core/shuffle";
import {
  placeDrop,
  rollDrops,
  collectDrops,
  DROP_RULES,
} from "../src/core/drops";
import { UPGRADES } from "../src/data/content";
import { validateRun } from "../src/services/storage";
import { World } from "../src/core/world";
const make = () => {
  const s = createRun("standard", "ranger", 123);
  ensureDeck(s);
  return s;
};
describe("统一构筑", () => {
  it("keeps initial equipment separate from card ranks", () => {
    const s = make();
    expect(heldLayers(s)).toBe(0);
    expect(s.deck!.baseWeapons).toEqual({ bow: 1 });
    grant(s, "weapon_bow");
    expect(s.player.weapons.bow).toBe(2);
    expect(s.player.upgrades.weapon_bow).toBe(1);
  });
  it("all definitions have classification, limits and effect parameters", () => {
    for (const u of UPGRADES) {
      expect(u.type).toBeTruthy();
      expect(["positive", "negative", "mixed"]).toContain(u.polarity);
      expect(u.effects).toBeTypeOf("object");
      expect(u.canShuffle).toBe(true);
    }
  });
  it("numeric cards and chests repeat beyond former limits", () => {
    const s = make();
    for (let i = 0; i < 15; i++) {
      expect(grant(s, "vitality")).toBe(true);
      expect(grant(s, "bow_power")).toBe(true);
      expect(grant(s, "chest_common")).toBe(true);
    }
    expect(s.player.upgrades.vitality).toBeGreaterThanOrEqual(15);
    expect(s.fate!.chests).toBe(15);
  });
  it("mechanism, weapon and skill caps still apply", () => {
    const s = make();
    for (let i = 0; i < 4; i++) {
      grant(s, "weapon_bow");
      grant(s, "skill_q");
    }
    expect(grant(s, "weapon_bow")).toBe(false);
    expect(grant(s, "skill_q")).toBe(false);
    grant(s, "split");
    expect(grant(s, "split")).toBe(false);
    expect(grant(s, "pierce")).toBe(false);
  });
  it("bounded stats convert surplus into useful finite damage", () => {
    const s = make();
    s.player.upgrades.critical = 1000;
    s.player.upgrades.haste = 1000;
    s.player.upgrades.armor = 1000;
    recalculate(s);
    const attack = s.player.attack;
    grant(s, "critical");
    expect(s.player.crit).toBe(0.75);
    expect(s.player.attack).toBeGreaterThan(attack);
    expect(s.player.cooldown).toBe(0.35);
    expect(modifier(s, "taken")).toBe(0.4);
    expect(() => validateRun(s)).not.toThrow();
  });
  it("negative cards stack, cleanse and leave no attribute residue", () => {
    const s = make(),
      hp = s.player.maxHp;
    addCurse(s, "wither");
    grant(s, "hex_damage");
    grant(s, "hex_xp");
    expect(s.player.upgrades.hex_wither).toBe(1);
    expect(s.player.attack).toBeLessThan(1);
    expect(modifier(s, "xp")).toBeLessThan(1);
    while (cleanse(s)) {}
    expect(s.player.maxHp).toBe(hp);
    expect(s.player.attack).toBe(1);
    expect(modifier(s, "xp")).toBe(1);
  });
  it("refresh spends one resource and avoids all old candidates when possible", () => {
    const s = make();
    offer(s);
    const old = [...s.choices],
      xp = s.player.xp;
    expect(refresh(s)).toBe(true);
    expect(s.deck!.refreshes).toBe(2);
    expect(s.choices.every((x) => !old.includes(x))).toBe(true);
    expect(s.player.xp).toBe(xp);
    refresh(s);
    refresh(s);
    const snapshot = structuredClone(s);
    expect(refresh(s)).toBe(false);
    expect(s).toEqual(snapshot);
  });
  it("fate gift adds resources rather than rerolling or chaining the draw", () => {
    const s = make();
    offer(s);
    s.choices = ["reroll"];
    expect(applyUpgrade(s, "reroll")).toBe(true);
    expect(s.deck!.refreshes).toBe(6);
    expect(s.phase).toBe("playing");
    expect(s.choices).toEqual([]);
  });
  it("negative draws cannot spend refreshes or offer positive effects", () => {
    const s = make();
    offer(s, [], "negative");
    expect(s.choices).toHaveLength(3);
    expect(
      s.choices.every(
        (id) => UPGRADES.find((u) => u.id === id)!.polarity === "negative",
      ),
    ).toBe(true);
    expect(refresh(s)).toBe(false);
    expect(s.deck!.refreshes).toBe(3);
    expect(applyUpgrade(s, "power")).toBe(false);
  });
  it("finite negative saturation leaves three valid infinite negatives", () => {
    const s = make();
    for (const u of UPGRADES.filter(
      (u) => u.polarity === "negative" && u.maxStacks !== null,
    ))
      s.player.upgrades[u.id] = u.max;
    offer(s, [], "negative");
    expect(s.choices).toHaveLength(3);
    expect(
      s.choices.every(
        (id) => UPGRADES.find((u) => u.id === id)!.maxStacks === null,
      ),
    ).toBe(true);
  });
});
describe("命运洗牌事务", () => {
  it("30 positive + 8 negative + shuffle itself becomes exactly 39 pure positive ranks", () => {
    const s = make();
    s.player.upgrades = { power: 30, hex_damage: 8 };
    recalculate(s);
    expect(grant(s, "shuffle")).toBe(true);
    expect(heldLayers(s)).toBe(39);
    expect(s.deck!.lastShuffle).toEqual({ removed: 39, added: 39 });
    for (const [id, n] of Object.entries(s.player.upgrades))
      if (n) {
        const u = UPGRADES.find((u) => u.id === id)!;
        expect(u.polarity).toBe("positive");
        expect(u.shuffleReward).toBe(true);
        expect(id).not.toBe("shuffle");
        expect(n).toBeLessThanOrEqual(u.max);
      }
    expect(Object.keys(s.player.weapons).length).toBeGreaterThan(0);
  });
  it("rebuilds weapons, skills, stats and removes old live effects", () => {
    const s = make();
    grant(s, "weapon_blade");
    grant(s, "skill_q");
    grant(s, "split");
    grant(s, "bow_power");
    addCurse(s, "wither");
    s.player.shield = 150;
    s.player.upgrades.shuffle = 1;
    const n = heldLayers(s);
    expect(shuffleDeck(s, () => "power")).toBe(true);
    expect(s.player.upgrades).toEqual({ power: n });
    expect(s.player.weapons).toEqual({ bow: 1 });
    expect(s.player.skillLevels.fire).toBe(1);
    expect(s.fate!.curses).toEqual({});
    expect(modifier(s, "damage", "bow")).toBe(1);
    expect(s.player.shield).toBe(0);
  });
  it("failure leaves the entire live run and RNG unchanged", () => {
    const s = make();
    grant(s, "power");
    const before = structuredClone(s);
    expect(
      shuffleDeck(s, () => {
        throw Error("fault injection");
      }),
    ).toBe(false);
    expect(s).toEqual(before);
    expect(shuffleDeck(s, () => "shuffle")).toBe(false);
    expect(s).toEqual(before);
  });
  it("seeded shuffle is reproducible and does not execute utilities", () => {
    const a = make(),
      b = make();
    for (const s of [a, b]) {
      s.player.upgrades = { chest_risk: 10, hex_wither: 3, skill_q: 2 };
      recalculate(s);
      grant(s, "shuffle");
    }
    expect(a).toEqual(b);
    expect(a.deck!.refreshes).toBe(3);
    expect(a.fate!.chests).toBe(0);
  });
  it("a billion ranks is processed within a fixed random budget and conserves every rank", () => {
    const s = make();
    s.player.upgrades.power = 1e9;
    s.player.upgrades.hex_xp = 8;
    recalculate(s);
    let draws = 0;
    expect(
      shuffleDeck(s, (pool) => {
        draws++;
        return pool[0].id;
      }),
    ).toBe(true);
    expect(draws).toBe(SHUFFLE_RANDOM_BUDGET);
    expect(heldLayers(s)).toBe(1e9 + 8);
    expect(Object.keys(s.player.upgrades).length).toBeLessThan(80);
    expect(() => validateRun(s)).not.toThrow();
  });
  it("shuffle save/load produces identical attributes and the same subsequent random stream", () => {
    const s = make();
    for (let i = 0; i < 10; i++) grant(s, "power");
    grant(s, "shuffle");
    const loaded = validateRun(structuredClone(s));
    expect(loaded).toEqual(s);
    offer(loaded);
    offer(s);
    expect(loaded.choices).toEqual(s.choices);
    expect(loaded.rng).toBe(s.rng);
  });
});
describe("掉落、队列、迁移", () => {
  it("drop probabilities are deterministic and reset minute budgets", () => {
    const a = make(),
      b = make();
    for (const s of [a, b])
      for (let i = 0; i < 200; i++) rollDrops(s, s.player, "boss");
    expect(a).toEqual(b);
    expect(a.deck!.dropsInWindow.positive).toBe(DROP_RULES.perMinute.positive);
    expect(a.deck!.dropsInWindow.negative).toBe(DROP_RULES.perMinute.negative);
    a.time = 60;
    rollDrops(a, a.player, "normal");
    expect(a.deck!.dropsInWindow.positive).toBeLessThanOrEqual(1);
  });
  it("thousands of drops merge with no lost draws and bounded objects", () => {
    const s = make();
    for (let i = 0; i < 2000; i++)
      placeDrop(s, s.player, i % 2 ? "positive" : "negative");
    expect(s.rewardDrops!.length).toBeLessThanOrEqual(32);
    collectDrops(s, 0.05);
    expect(s.deck!.pending).toEqual({ positive: 1000, negative: 1000 });
    expect(s.rewardDrops).toEqual([]);
    checkLevel(s);
    expect(s.deck!.active).toBe("negative");
    expect(s.deck!.pending.negative).toBe(999);
  });
  it("queued rewards survive pausing, saving, resuming and consecutive choices", () => {
    const s = make();
    placeDrop(s, s.player, "negative", 2);
    placeDrop(s, s.player, "positive", 3);
    collectDrops(s, 0.05);
    checkLevel(s);
    const v = validateRun(s);
    expect(v.deck!.pending).toEqual({ negative: 1, positive: 3 });
    for (let i = 0; i < 5; i++) {
      expect(v.phase).toBe("upgrade");
      expect(applyUpgrade(v, v.choices[0])).toBe(true);
    }
    expect(v.phase).toBe("playing");
    expect(v.deck!.pending).toEqual({ negative: 0, positive: 0 });
  });
  it("v1.0 converts initial equipment and old upgrades without consuming RNG", () => {
    const old = createRun("standard");
    old.player.upgrades.power = 2;
    old.player.attack = 1.24;
    const rng = old.rng;
    const s = validateRun(old);
    expect(s.player.upgrades.weapon_bow).toBe(0);
    expect(s.player.weapons.bow).toBe(1);
    expect(s.player.attack).toBe(1.24);
    expect(s.deck!.refreshes).toBe(3);
    expect(s.rng).toBe(rng);
  });
  it("v1.1 curses convert once and preserve numerical effects", () => {
    const s = createRun("standard");
    const f = fate(s);
    f.curses = { wither: 2, frail: 1 };
    s.player.maxHp = 110 * 0.76;
    s.player.hp = s.player.maxHp;
    const v = validateRun(s);
    expect(v.player.upgrades.hex_wither).toBe(2);
    expect(v.player.maxHp).toBeCloseTo(83.6);
    const twice = validateRun(v);
    expect(twice).toEqual(v);
    expect(modifier(twice, "taken")).toBe(1.15);
  });
  it("invalid queue, baseline or drop records are rejected", () => {
    const s = make();
    s.deck!.pending.negative = -1;
    expect(() => validateRun(s)).toThrow();
    const v = make();
    v.rewardDrops = [{ x: 1800, y: 1800, kind: "positive", count: NaN }];
    expect(() => validateRun(v)).toThrow();
  });
  it("negative draw from a real drop pauses World and can resume after choosing", () => {
    const s = make();
    const w = new World(s);
    placeDrop(s, s.player, "negative");
    w.step(0.05, { x: 0, y: 0, aim: s.player });
    expect(s.phase).toBe("upgrade");
    const time = s.time;
    w.step(0.05, { x: 1, y: 0, aim: s.player });
    expect(s.time).toBe(time);
    w.choose(s.choices[0]);
    expect(s.phase).toBe("playing");
  });
  it("all numeric records produce finite current/next descriptions", () => {
    const s = make();
    for (const u of UPGRADES) {
      expect(cardDescription(s, u.id)).not.toContain("NaN");
      expect(cardDescription(s, u.id)).not.toContain("Infinity");
    }
  });
});

it("late movement and dash speeds do not tunnel through map obstacles", async () => {
  const { move } = await import("../src/core/math");
  const body = { x: 1700, y: 1800 };
  move(body, 100, 0, 16, [{ x: 1745, y: 1800, r: 25 }]);
  expect(body.x).toBeLessThanOrEqual(1704);
});

it("a mid-transaction fault rolls back previous draft selections too", () => {
  const s = make();
  s.player.upgrades.power = 10;
  recalculate(s);
  const old = structuredClone(s);
  let i = 0;
  expect(
    shuffleDeck(s, () => {
      if (++i === 4) throw Error("mid-flight fault");
      return "power";
    }),
  ).toBe(false);
  expect(s).toEqual(old);
});
it("shuffle removes old projectiles, zones and control effects without restoring dealt damage", async () => {
  const { spawn } = await import("../src/core/director");
  const s = make();
  const w = new World(s);
  grant(s, "power");
  const e = spawn(w, "crawler", { x: 2000, y: 2000 })!;
  e.hp = 20;
  e.burn = 5;
  e.burnPower = 50;
  e.freeze = 3;
  e.slow = 4;
  w.shoot(s.player, { x: 1, y: 0 }, 10, "bow", "bow");
  w.shoot(s.player, { x: 1, y: 0 }, 10, "enemy", "enemy", true);
  w.zone(s.player, 60, 10, "fire", false);
  w.zone(s.player, 60, 10, "meteor", true);
  expect(grant(s, "shuffle")).toBe(true);
  expect(s.bullets).toHaveLength(1);
  expect(s.bullets[0].enemy).toBe(true);
  expect(s.zones).toHaveLength(1);
  expect(s.zones[0].enemy).toBe(true);
  expect(e.hp).toBe(20);
  expect([e.burn, e.burnPower, e.freeze, e.slow]).toEqual([0, 0, 0, 0]);
});
it("shuffle keeps independent refresh resources and unclaimed draws", () => {
  const s = make();
  s.deck!.refreshes = 11;
  s.deck!.pending = { positive: 3, negative: 2 };
  grant(s, "power");
  expect(grant(s, "shuffle")).toBe(true);
  expect(s.deck!.refreshes).toBe(11);
  expect(s.deck!.pending).toEqual({ positive: 3, negative: 2 });
});
it("numeric extremes stay finite, serializable and bounded in object count", () => {
  const s = make();
  for (const id of [
    "vitality",
    "power",
    "renew",
    "stride",
    "critical",
    "haste",
    "magnet",
    "armor",
    "bow_quick",
    "bow_power",
    "burn",
    "wide",
    "shatter",
  ])
    s.player.upgrades[id] = 1e9;
  recalculate(s);
  expect(
    Object.values(s.player)
      .filter((v) => typeof v === "number")
      .every(Number.isFinite),
  ).toBe(true);
  expect(s.player.speed).toBeLessThanOrEqual(500);
  expect(s.player.crit).toBeLessThanOrEqual(0.75);
  expect(s.player.cooldown).toBeGreaterThanOrEqual(0.35);
  expect(() => validateRun(s)).not.toThrow();
  expect(s.fate!.history.length).toBeLessThan(80);
});

it("refresh and drop counters respect safe serialization boundaries", () => {
  const s = make();
  s.deck!.refreshes = 1e12;
  expect(grant(s, "reroll")).toBe(false);
  const before = structuredClone(s);
  expect(() => placeDrop(s, s.player, "positive", Infinity)).toThrow();
  expect(() => placeDrop(s, s.player, "positive", -1)).toThrow();
  expect(s).toEqual(before);
  s.deck!.earned.positive = 1e12;
  for (let i = 0; i < 40; i++) rollDrops(s, s.player, "boss");
  expect(
    (s.rewardDrops || []).filter((d) => d.kind === "positive"),
  ).toHaveLength(0);
  expect(() => validateRun(s)).not.toThrow();
});

it("bulk random allocation varies by seed, remains all-positive and keeps every rank", () => {
  const runs = [make(), make()];
  runs[1].rng = 456;
  for (const s of runs) {
    s.player.upgrades.power = 1e6;
    recalculate(s);
    expect(shuffleDeck(s, () => "power")).toBe(true);
    expect(heldLayers(s)).toBe(1e6);
    expect(Object.keys(s.player.upgrades).length).toBeGreaterThan(3);
    expect(s.player.upgrades.power).toBeLessThan(1e6);
    for (const [id, n] of Object.entries(s.player.upgrades))
      if (n) {
        expect(UPGRADES.find((u) => u.id === id)!.polarity).toBe("positive");
        expect(s.fate!.history).toContain(id);
      }
  }
  expect(runs[0].player.upgrades).not.toEqual(runs[1].player.upgrades);
});

it("shuffle replaces cursed remaining cooldowns with exactly the new full cooldown", async () => {
  const { SKILLS } = await import("../src/data/skills");
  const s = make();
  for (let i = 0; i < 3; i++) addCurse(s, "silence");
  s.player.cooldowns = s.player.skills.map(
    (id) => SKILLS[id].cooldown * s.player.cooldown,
  );
  expect(s.player.cooldowns[2]).toBe(46.800000000000004);
  s.player.upgrades.shuffle = 1;
  expect(shuffleDeck(s, () => "power")).toBe(true);
  expect(s.player.cooldown).toBe(1);
  expect(s.player.cooldowns).toEqual(
    s.player.skills.map((id) => SKILLS[id].cooldown),
  );
  expect(s.player.dashCd).toBe(2.7);
});
