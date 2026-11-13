import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { spawn } from "../src/core/director";
import { ASSET_IDS } from "../src/services/assets";
import { VISUALS } from "../src/data/visuals";
import {
  EFFECT_NAMES,
  EFFECT_VISUALS,
  EFFECT_SHEETS,
  FX_DEPTH,
  FX_BUDGET,
  impactFrame,
  weaponEffect,
  skillEffect,
  bossEffect,
} from "../src/data/effects";
import { BattleFeedback } from "../src/render/battleFeedback";
import {
  paintBattleEffects,
  transientEffect,
  type FxDraw,
} from "../src/render/battleEffects";
function fixture() {
  const w = new World(createRun("endless", "mage", 190));
  w.s.time = 600;
  return w;
}
describe("formal effects are bounded presentation data", () => {
  it("maps 25 local replaceable assets including one four-frame sheet", () => {
    const manifest = JSON.parse(
      readFileSync("public/assets/v1.9.0/effects/manifest.json", "utf8"),
    );
    expect(manifest.assets).toHaveLength(25);
    for (const a of manifest.assets) {
      expect(VISUALS[a.id]).toBe(EFFECT_VISUALS[a.id]);
      expect(ASSET_IDS.find((x) => x.id === a.id)?.group).toBe("正式特效");
      expect(
        readFileSync("public/assets/" + VISUALS[a.id])
          .subarray(0, 4)
          .toString(),
      ).toBe("RIFF");
    }
    expect(EFFECT_SHEETS["vfx.impact"].frames).toBe(4);
    expect(Object.keys(EFFECT_NAMES)).toHaveLength(25);
  });
  it("covers five weapons, six skills, all seven bosses with distinct theme materials", () => {
    for (const id of ["bow", "blade", "ember", "orbit", "drone"])
      expect(EFFECT_NAMES[weaponEffect(id)]).toBeTruthy();
    for (const id of ["fire", "ice", "lance", "ward", "bloom", "storm"])
      expect(EFFECT_NAMES[skillEffect(id)]).toBeTruthy();
    expect(
      new Set(
        [
          "warden",
          "witch",
          "titan",
          "crystalQueen",
          "candyWitch",
          "eclipseSaint",
          "mirrorMaiden",
        ].map((x) => bossEffect(x)),
      ).size,
    ).toBe(6);
    expect(bossEffect("titan", "fan")).toBe("fan");
    expect(transientEffect("unmapped")).toBeUndefined();
  });
  it("holds the final animation frame, never loops or indexes outside a sheet", () => {
    expect([0, 0.25, 0.5, 0.75, 1, 2, -1].map((p) => impactFrame(p))).toEqual([
      0, 1, 2, 3, 3, 3, 0,
    ]);
    expect(FX_DEPTH.danger).toBeGreaterThan(FX_DEPTH.player);
    expect(FX_DEPTH.player).toBeGreaterThan(FX_DEPTH.impact);
    expect(FX_BUDGET.high).toBe(96);
    expect(FX_BUDGET.low).toBe(24);
  });
  it("observes births, hits, phase transitions and deaths without changing rules or RNG", () => {
    const w = fixture(),
      f = new BattleFeedback();
    f.reset(w.s);
    const e = spawn(w, "warden", { x: 1900, y: 1800 })!;
    let before = JSON.stringify(w.s);
    f.observe(w.s);
    expect(JSON.stringify(w.s)).toBe(before);
    expect(f.pulses.map((x) => x.kind)).toContain("spawn");
    e.hp = e.maxHp * 0.4;
    w.s.time += 0.1;
    before = JSON.stringify(w.s);
    f.observe(w.s);
    expect(JSON.stringify(w.s)).toBe(before);
    expect(f.pulses.map((x) => x.kind)).toEqual(
      expect.arrayContaining(["hit", "phase"]),
    );
    w.s.enemies = [];
    f.observe(w.s);
    expect(f.pulses.map((x) => x.kind)).toContain("dissolve");
    const n = f.pulses.length;
    f.observe(w.s);
    expect(f.pulses).toHaveLength(n);
  });
  it("freezes pulse lifetime on pause and clears all transient state on restore", () => {
    const w = fixture(),
      f = new BattleFeedback();
    f.reset(w.s);
    spawn(w, "crawler", { x: 1800, y: 1800 });
    f.observe(w.s);
    const a = f.pulses[0].age;
    w.s.phase = "upgrade";
    for (let i = 0; i < 10; i++) f.observe(w.s);
    expect(f.pulses[0].age).toBe(a);
    w.s.time += 1;
    f.observe(w.s);
    expect(f.pulses).toHaveLength(0);
    f.reset(w.s);
    expect(f.pulses).toHaveLength(0);
  });
  it("distinguishes fleeing mimics from death feedback and bounds accumulated pulses", () => {
    const w = fixture(),
      f = new BattleFeedback();
    const e = spawn(w, "mimic", { x: 1800, y: 1800 })!;
    e.behavior = {
      ...(e.behavior || {}),
      awakened: false,
      escapeRemaining: 1,
    } as typeof e.behavior;
    f.reset(w.s);
    w.s.enemies = [];
    f.observe(w.s);
    expect(f.pulses[0].kind).toBe("candy");
    for (let i = 0; i < 150; i++) {
      spawn(w, "crawler", { x: 1800, y: 1800 });
      f.observe(w.s);
    }
    expect(f.pulses.length).toBeLessThanOrEqual(96);
  });
  it("draws every major status and shape with finite sizes without mutating the run", () => {
    const w = fixture();
    w.s.player.shield = 10;
    w.s.player.dash = 0.1;
    w.s.player.upgrades.armor = 1;
    for (const kind of ["fire", "ice", "lance", "ward", "bloom", "storm"])
      w.zone(w.s.player, 80, 10, kind, false, 0.3, 2, kind);
    for (const kind of [
      "warden",
      "witch",
      "titan",
      "crystalQueen",
      "candyWitch",
      "eclipseSaint",
      "mirrorMaiden",
    ])
      w.zone({ x: 1900, y: 1800 }, 60, 10, "warning", true, 0.4, 2, kind);
    const z = w.zone(w.s.player, 30, 10, "beam", true, 0.6, 2, "crystalQueen")!;
    z.shape = {
      kind: "bar",
      angle: 1,
      length: 300,
      halfAngle: 0.7,
      omega: 0,
      vx: 0,
      vy: 0,
      owner: 0,
    };
    const calls: Parameters<FxDraw>[] = [];
    const draw: FxDraw = (...args) => {
      calls.push(args);
      return true;
    };
    const before = JSON.stringify(w.s);
    paintBattleEffects(w.s, [], [], draw, 0);
    expect(JSON.stringify(w.s)).toBe(before);
    expect(
      calls.some((c) => c[0] === "beam" && c[2] === 300 && c[3] === 60),
    ).toBe(true);
    expect(
      calls.every(
        (c) =>
          Number.isFinite(c[2]) &&
          (c[3] === undefined || Number.isFinite(c[3])),
      ),
    ).toBe(true);
    for (const name of [
      "shield",
      "dash",
      "frost",
      "lance",
      "heal",
      "starfall",
      "warning",
    ])
      expect(calls.some((c) => c[0] === name)).toBe(true);
  });
  it("keeps revival on independent presentation time and failure of a texture harmless", () => {
    const w = fixture();
    w.s.phase = "reviving";
    const sizes: number[] = [];
    const draw: FxDraw = (id, p, size) => {
      if (id === "revive") sizes.push(size);
      return false;
    };
    const before = JSON.stringify(w.s);
    paintBattleEffects(w.s, [], [], draw, 0);
    paintBattleEffects(w.s, [], [], draw, 0.7);
    expect(sizes[1]).toBeGreaterThan(sizes[0]);
    expect(JSON.stringify(w.s)).toBe(before);
  });
});
