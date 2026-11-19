import { describe, expect, it } from "vitest";
import { ensureDeck } from "../src/core/deckState";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { spawn } from "../src/core/director";
import { grant } from "../src/core/progression";
import { CombatPolicy, predictedZone, COMBAT_V3 } from "../src/ai/combat";
import { BuildPolicy, evaluateCards, BUILD_V3 } from "../src/ai/build";
import { LegacyPolicy } from "../src/ai/legacy";
import { observe } from "../src/ai/types";
import { matchesSchedule } from "../tools/ai/manifest";
import { runMatch } from "../tools/ai/runner";
import { simulate } from "./simulate";
import { zoneContains } from "../src/core/attackGeometry";
function freeze<T>(v: T): T {
  if (v && typeof v === "object") {
    Object.freeze(v);
    for (const x of Object.values(v)) freeze(x);
  }
  return v;
}
describe("AI observation and fair execution", () => {
  it("does not expose RNG or director schedules and policies cannot mutate observations", () => {
    const w = new World(createRun("standard"));
    spawn(w, "archer", { x: 1950, y: 1800 });
    const before = JSON.stringify(w.s),
      o = freeze(observe(structuredClone(w.s)));
    expect(o).not.toHaveProperty("rng");
    expect(o).not.toHaveProperty("seed");
    expect(o).not.toHaveProperty("nextBoss");
    for (const p of [
      new LegacyPolicy(),
      new CombatPolicy(),
      new BuildPolicy(),
    ]) {
      expect(Number.isFinite(p.act(o).x)).toBe(true);
    }
    expect(JSON.stringify(w.s)).toBe(before);
  });
  it("matches the unchanged legacy script at its original 20 Hz cadence", () => {
    const actual = runMatch({
      policy: "legacy",
      character: "ranger",
      seed: 11,
      map: "forest",
      mode: "standard",
      seconds: 140,
      hz: 20,
    });
    const old = simulate(140, "ranger", 11);
    expect(Math.round(actual.seconds)).toBe(old.seconds);
    expect(actual.kills).toBe(old.kills);
    expect(actual.bosses).toBe(old.bosses);
    expect(Math.round(actual.damage)).toBe(old.damage);
    expect(actual.player.weapons).toEqual(old.weapons);
  }, 30000);
  it("replays seed, cards, damage and movement deterministically", () => {
    const opts = {
      policy: "build-v4",
      character: "ranger",
      seed: 7,
      map: "forest" as const,
      mode: "standard" as const,
      seconds: 25,
    };
    const a = runMatch(opts),
      b = runMatch(opts);
    expect(a.cards).toEqual(b.cards);
    expect(a.player).toEqual(b.player);
    expect(a.damage).toBe(b.damage);
  }, 30000);
  it("ends at an explicit censoring cap without fabricating death or victory", () => {
    const r = runMatch({
      policy: "build-v4",
      character: "knight",
      seed: 19,
      map: "forest",
      mode: "endless",
      seconds: 2,
    });
    expect(r.censored).toBe(true);
    expect(r.victory).toBe(false);
    expect(r.causes).toEqual([]);
    expect(r.player.maxHp).toBe(createRun("endless", "knight").player.maxHp);
  });
});
describe("predictive motion and build choices", () => {
  it("predicts moving/rotating bars using active time after telegraph, not radius-only", () => {
    const w = new World(createRun("standard")),
      z = w.zone({ x: 1800, y: 1800 }, 15, 20, "bossShape", true, 0.5, 1)!;
    z.shape = {
      kind: "bar",
      angle: 0,
      length: 600,
      halfAngle: 0,
      omega: 1,
      vx: 100,
      vy: 0,
      owner: 1,
    };
    expect(zoneContains(z, { x: 2050, y: 1800 })).toBe(true);
    expect(predictedZone(z, 0.3).x).toBe(1800);
    expect(predictedZone(z, 0.8).x).toBeCloseTo(1830);
    expect(predictedZone(z, 0.8).shape!.angle).toBeCloseTo(0.3);
  });
  it("chooses an escape from a visible incoming bullet rather than loot straight ahead", () => {
    const w = new World(createRun("standard"));
    w.s.player.invincible = 0;
    w.s.gems = [{ x: 1950, y: 1800, value: 50 }];
    w.shoot({ x: 1950, y: 1800 }, { x: -1, y: 0 }, 35, "enemy", "enemy", true, {
      vx: -300,
      vy: 0,
    });
    const input = new CombatPolicy().act(observe(w.s));
    expect(Math.abs(input.y)).toBeGreaterThan(0.2);
  });
  it("values critical chance more with critical damage and scores no hidden RNG result", () => {
    const s = createRun("standard");
    s.phase = "upgrade";
    s.choices = ["critical", "crit_damage", "power"];
    const low = evaluateCards(observe(s)).scores.find(
      (x) => x.id === "critical",
    )!.score;
    grant(s, "crit_damage");
    grant(s, "crit_damage");
    grant(s, "crit_damage");
    const high = evaluateCards(observe(s)).scores.find(
      (x) => x.id === "critical",
    )!.score;
    expect(high).toBeGreaterThan(low);
    s.choices = ["chest_epic", "shuffle", "power"];
    const a = evaluateCards(observe(s));
    s.rng = 123456;
    expect(evaluateCards(observe(s))).toEqual(a);
  });
  it("keeps urgency context fixed when a healing card crosses the low-health threshold", () => {
    const s = createRun("standard");
    new World(s);
    s.player.hp = 38;
    s.phase = "upgrade";
    s.choices = ["vitality", "power", "renew"];
    const scores = evaluateCards(observe(s), BUILD_V3).scores;
    expect(scores.find((x) => x.id === "vitality")!.score).toBeGreaterThan(0);
  });
  it("evaluates choices on frozen snapshots and accepts a legal forced negative", () => {
    const s = createRun("standard");
    s.phase = "upgrade";
    s.choices = ["hex_lead", "hex_damage", "hex_xp"];
    ensureDeck(s).active = "negative";
    const before = JSON.stringify(s),
      d = new BuildPolicy().choose(freeze(observe(structuredClone(s))));
    expect(s.choices).toContain(d.id);
    expect(d.refresh).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
});

it("censors a capped upgrade and checks the complete benchmark task", () => {
  const job = {
    policy: "build-v4",
    character: "ranger",
    map: "forest",
    seed: 7,
    mode: "standard",
    hz: 60,
    decisionHz: 20,
    seconds: 13.066666666666896,
  } as const;
  const row = runMatch(job);
  expect(row).toMatchObject({
    phase: "upgrade",
    censored: true,
    victory: false,
  });
  expect(matchesSchedule([job], [row])).toBe(true);
  expect(matchesSchedule([job], [{ ...row, seed: 8 }])).toBe(false);
  expect(matchesSchedule([job], [{ ...row, limitSeconds: 13 }])).toBe(false);
  expect(matchesSchedule([job, job], [row, row])).toBe(false);
});
