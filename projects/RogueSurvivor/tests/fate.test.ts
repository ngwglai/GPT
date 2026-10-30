import { describe, it, expect } from "vitest";
import { createRun } from "../src/core/create";
import {
  grant,
  eligible,
  offer,
  applyUpgrade,
  cardDescription,
} from "../src/core/progression";
import {
  fate,
  addCurse,
  cleanse,
  recalculate,
  forget,
  modifier,
} from "../src/core/fate";
import { validateRun } from "../src/services/storage";
import { UPGRADES } from "../src/data/content";
import {
  NEW_CARDS,
  MODIFIERS,
  modifierText,
} from "../src/data/cards/expedition";
describe("命运与奇遇", () => {
  it("adds at least 25 unique functional definitions", () => {
    expect(NEW_CARDS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(UPGRADES.map((u) => u.id)).size).toBe(UPGRADES.length);
  });
  it("retains prerequisites and exclusions", () => {
    const s = createRun("standard");
    expect(grant(s, "blade_power")).toBe(false);
    expect(grant(s, "split")).toBe(true);
    expect(grant(s, "pierce")).toBe(false);
  });
  it("limits every new definition", () => {
    for (const u of NEW_CARDS) {
      const s = createRun("standard");
      s.player.upgrades[u.id] = u.max;
      expect(eligible(s).some((x) => x.id === u.id)).toBe(false);
    }
  });
  it("bounds curses and restores attributes without drift", () => {
    const s = createRun("standard");
    const hp = s.player.maxHp;
    for (let i = 0; i < 3; i++) expect(addCurse(s, "wither")).toBe(true);
    expect(addCurse(s, "wither")).toBe(false);
    expect(s.player.maxHp).toBeCloseTo(hp * 0.64);
    for (let i = 0; i < 3; i++) cleanse(s, "wither");
    expect(s.player.maxHp).toBe(hp);
    for (let i = 0; i < 50; i++) recalculate(s);
    expect(s.player.maxHp).toBe(hp);
  });
  it("safely forgets additive upgrades under a multiplier", () => {
    const s = createRun("standard");
    grant(s, "fortress");
    addCurse(s, "wither");
    expect(forget(s)).toBe("fortress");
    expect(s.player.maxHp).toBeCloseTo(110 * 0.88);
    cleanse(s);
    expect(s.player.maxHp).toBe(110);
  });
  it.each([
    "chest_common",
    "chest_rare",
    "chest_epic",
    "chest_risk",
    "baptism",
  ])("deterministic legal rewards: %s", (id) => {
    const a = createRun("standard", "ranger", 44),
      b = createRun("standard", "ranger", 44);
    grant(a, id);
    grant(b, id);
    expect(a).toEqual(b);
    expect(() => validateRun(a)).not.toThrow();
    expect(a.fate!.log.length).toBeGreaterThan(0);
  });
  it("fallbacks when ordinary pool exhausted", () => {
    const s = createRun("standard");
    for (const u of UPGRADES)
      if (u.rarity === 0 && !u.id.startsWith("chest_"))
        s.player.upgrades[u.id] = u.max;
    grant(s, "chest_common");
    expect(s.player.shield).toBe(20);
  });
  it("rerolls without consuming the level or chaining itself", () => {
    const s = createRun("standard");
    s.phase = "upgrade";
    s.choices = ["reroll"];
    const lv = s.player.level;
    expect(applyUpgrade(s, "reroll")).toBe(true);
    expect(s.phase).toBe("upgrade");
    expect(s.player.level).toBe(lv);
    expect(s.choices).not.toContain("reroll");
    expect(s.choices).not.toContain("forget");
  });
  it("supports all five weapons through save restore", () => {
    const s = createRun("standard");
    for (const id of ["blade", "ember", "orbit", "drone"])
      grant(s, "weapon_" + id);
    expect(
      Object.keys(validateRun(structuredClone(s)).player.weapons),
    ).toHaveLength(5);
  });
  it("migrates legacy state lazily and preserves RNG", () => {
    const s = createRun("standard");
    s.player.upgrades.power = 2;
    s.player.attack = 1.24;
    const old = validateRun(structuredClone(s));
    const rng = old.rng;
    fate(old);
    recalculate(old);
    expect(old.player.attack).toBe(1.24);
    expect(old.rng).toBe(rng);
    grant(old, "vigor");
    forget(old);
    expect(old.player.attack).toBe(1.24);
  });
  it("rejects malformed curse records", () => {
    const s = createRun("standard");
    fate(s).curses.wither = 4;
    expect(() => validateRun(s)).toThrow();
  });
  it("describes shared parameters and increments", () => {
    const s = createRun("standard");
    for (const [id, m] of Object.entries(MODIFIERS)) {
      expect(cardDescription(s, id)).toContain(modifierText(m));
    }
    grant(s, "vigor");
    expect(cardDescription(s, "vigor")).toContain("当前1级 → 2级");
    expect(s.player.attack).toBeCloseTo(1.07);
  });
  it("risk benefits and harms are effective and recoverable", () => {
    const s = createRun("standard");
    grant(s, "greed");
    expect(modifier(s, "xp")).toBe(1.45);
    expect(modifier(s, "taken")).toBe(1.15);
    cleanse(s);
    expect(modifier(s, "taken")).toBe(1);
  });
});

it("legacy removable ranks are reconstructed and new skill/weapon levels are not removed", () => {
  const s = createRun("standard");
  s.player.upgrades.power = 1;
  s.player.attack = 1.12;
  expect(forget(s)).toBe("power");
  expect(s.player.attack).toBeCloseTo(1);
  expect(s.player.weapons.bow).toBe(1);
});

it("execution and specialist alter actual damage; harvest heals on kill", async () => {
  const { World } = await import("../src/core/world");
  const { spawn } = await import("../src/core/director");
  const s = createRun("standard");
  const w = new World(s);
  s.player.weapons = {};
  s.player.regen = 0;
  s.player.hp = 50;
  grant(s, "execution");
  grant(s, "specialist");
  grant(s, "harvest");
  spawn(w, "crawler", { x: 2200, y: 2200 });
  const e = s.enemies[0];
  e.hp = 9;
  w.damage(e, 1, "bow", false);
  expect(e.hp).toBeCloseTo(9 - 1.4 * 1.3);
  e.hp = 0;
  w.step(0.05, { x: 0, y: 0, aim: s.player });
  expect(s.player.hp).toBeCloseTo(50.3);
});
it("wildfire transmits without exponential burn amplification", async () => {
  const { World } = await import("../src/core/world");
  const { spawn } = await import("../src/core/director");
  const s = createRun("standard");
  s.player.weapons = {};
  s.player.upgrades.burn = 4;
  s.player.upgrades.wildfire = 1;
  const w = new World(s);
  spawn(w, "crawler", { x: 2200, y: 2200 });
  spawn(w, "crawler", { x: 2230, y: 2200 });
  const [a, b] = s.enemies;
  w.burn(a, 10, "ember");
  a.hp = 0;
  w.step(0.05, { x: 0, y: 0, aim: s.player });
  expect(b.burnPower).toBe(20);
});

it("checks actual equipment levels as well as card counters", () => {
  const s = createRun("standard");
  s.player.weapons.bow = 5;
  s.player.skillLevels[s.player.skills[0]] = 5;
  expect(grant(s, "weapon_bow")).toBe(false);
  expect(grant(s, "skill_q")).toBe(false);
});

it("skill-specific upgrades require equipped sources, including chest rewards", () => {
  const s = createRun("standard", "ranger", 99, "fire");
  expect(grant(s, "ice_master")).toBe(false);
  expect(grant(s, "lance_master")).toBe(false);
  expect(grant(s, "fire_master")).toBe(true);
  for (const id of ["chest_rare", "chest_epic", "chest_risk"]) grant(s, id);
  expect(s.player.upgrades.ice_master || 0).toBe(0);
  expect(s.player.upgrades.lance_master || 0).toBe(0);
});
it.each(["兽潮来袭", "流星雨", "月蚀弹幕"])(
  "rewards preserve active encounter %s",
  (event) => {
    const s = createRun("standard");
    s.event = event;
    s.eventUntil = 40;
    for (const id of ["chest_common", "cleanse"]) grant(s, id);
    expect(s.event).toBe(event);
    expect(s.eventUntil).toBe(40);
    expect(s.fate!.noticeUntil).toBe(8);
  },
);
