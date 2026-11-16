import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import fixture from "./fixtures/ai-v52-replay.json";
import { LabSession } from "../src/ai/session";
import { SimulationClock, FIXED_DT, SPEEDS } from "../src/ai/clock";
import {
  LabHistory,
  HISTORY_KEY,
  HISTORY_BYTES,
  recordRun,
} from "../src/ai/history";
import { LOG_LIMITS, type PolicyId } from "../src/ai/controller";
import { observe } from "../src/ai/types";
import { createPolicy } from "../src/ai/controller";
function session(policy: PolicyId = "build") {
  return new LabSession({
    policy,
    character: "ranger",
    map: "forest",
    mode: "standard",
    seed: 11,
  });
}
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
describe("visual telemetry is observational", () => {
  for (const row of fixture.rows)
    it(`${row.id}/${row.character}: debug on and off match PR #52 through 200 seconds`, () => {
      for (const enabled of [false, true]) {
        const s = new LabSession({
          policy: row.id as PolicyId,
          character: row.character,
          map: "forest",
          mode: "standard",
          seed: 11,
        });
        s.controller.setDebug(enabled);
        for (let n = 0; n < row.ticks; n++) s.step();
        expect(hash(s.world.s)).toBe(row.hash);
        if (enabled) {
          const d = s.controller.policy.debug!;
          expect(d.candidates[d.selected].direction.x).toBe(
            s.controller.lastInput!.x,
          );
          expect(d.candidates[d.selected].direction.y).toBe(
            s.controller.lastInput!.y,
          );
          if (d.algorithm === "predictive")
            for (const c of d.candidates) {
              expect(
                Object.values(c.parts!).reduce((a, b) => a + b, 0),
              ).toBeCloseTo(c.risk!, 6);
              expect(c.path).toHaveLength(9);
            }
        }
      }
    }, 120000);
  it("card logs retain the exact scores returned by the actual policy", () => {
    const s = session(),
      w = s.world;
    w.s.phase = "upgrade";
    w.s.choices = ["power", "critical", "vitality"];
    w.s.deck!.active = "positive";
    w.s.deck!.refreshes = 0;
    const expected = createPolicy("build").choose(
      observe(structuredClone(w.s)),
    );
    s.controller.manage(w);
    expect(s.controller.choices[0].scores).toEqual(expected.scores);
    expect(s.controller.choices[0].chosen).toBe(expected.id);
  });
  it("logs only successful casts, preserving exact clamped target and cooldown", () => {
    const s = session(),
      p = s.world.s.player;
    expect(s.world.cast(0, { x: p.x + 900, y: p.y + 387 })).toBe(true);
    expect(s.world.cast(0, { x: p.x + 100, y: p.y })).toBe(false);
    expect(s.controller.skills).toHaveLength(1);
    const zone = s.world.s.zones.find((z) => !z.enemy && z.kind === "fire")!;
    expect(s.controller.skills[0].target).toEqual({ x: zone.x, y: zone.y });
    expect(Math.hypot(zone.x - p.x, zone.y - p.y)).toBeCloseTo(450);
    expect(s.world.cast(1, { x: p.x + 400, y: p.y })).toBe(true);
    expect(s.controller.skills[1].target).toEqual({ x: p.x, y: p.y });
  });
});
describe("fixed-step speed control", () => {
  it.each(SPEEDS)(
    "%sx changes work per wall second, never game rules or decision cadence",
    (speed) => {
      const s = session(),
        reference = session(),
        clock = new SimulationClock();
      clock.speed = speed;
      let ticks = 0;
      for (let frame = 0; frame < 240; frame++)
        ticks += clock.advance(
          FIXED_DT,
          () => s.step(),
          () => 0,
          Infinity,
        );
      expect(ticks).toBe(240 * speed);
      for (let n = 0; n < ticks; n++) reference.step();
      expect(hash(s.world.s)).toBe(hash(reference.world.s));
      expect(s.controller.decisions).toBe(reference.controller.decisions);
    },
  );
  it("limits CPU work and debt, and never jumps the World clock when overloaded", () => {
    const c = new SimulationClock();
    c.speed = 8;
    let now = 0,
      ticks = 0;
    c.advance(
      0.25,
      () => {
        ticks++;
        return true;
      },
      () => (now += 3),
      8,
    );
    expect(ticks).toBeLessThan(48);
    expect(c.limited).toBe(true);
    c.paused = true;
    expect(
      c.advance(20, () => {
        throw Error("paused");
      }),
    ).toBe(0);
    c.reset();
    c.paused = false;
    expect(
      c.advance(
        FIXED_DT / 8,
        () => true,
        () => 0,
        Infinity,
      ),
    ).toBe(1);
  });
  it("pause/resume freezes state and a fresh session resets decisions and run state", () => {
    const s = session();
    s.advance(0.1);
    s.paused = true;
    const before = hash(s.world.s);
    s.advance(50);
    expect(hash(s.world.s)).toBe(before);
    s.paused = false;
    s.advance(0.05);
    expect(s.world.s.time).toBeGreaterThan(0);
    const fresh = session();
    expect(fresh.world.s.time).toBe(0);
    expect(fresh.controller.decisions).toBe(0);
  });
});
describe("bounded AI-only history", () => {
  it("bounds current logs and persistent storage independently of manual saves", () => {
    const s = session();
    for (let n = 0; n < 300; n++) {
      s.world.s.phase = "upgrade";
      s.world.s.choices = ["power"];
      s.world.s.deck!.active = "positive";
      s.world.s.deck!.refreshes = 0;
      s.controller.manage(s.world);
      s.controller.recordSkill({
        time: n,
        skill: "fire",
        slot: 0,
        target: { x: 1, y: 2 },
      });
    }
    expect(s.controller.choices).toHaveLength(LOG_LIMITS.choices);
    expect(s.controller.skills).toHaveLength(LOG_LIMITS.skills);
    expect(s.controller.choicesTotal).toBe(300);
    const data = new Map<string, string>([["manual-sentinel", "keep"]]);
    const h = new LabHistory({
      getItem: (k) => data.get(k) || null,
      setItem: (k, v) => {
        data.set(k, v);
      },
    });
    for (let n = 0; n < 30; n++)
      h.save(recordRun(s, String(n), "2026-11-16T00:00:00Z", "restarted"));
    expect(h.records.length).toBeLessThanOrEqual(12);
    expect(data.get(HISTORY_KEY)!.length * 2).toBeLessThanOrEqual(
      HISTORY_BYTES,
    );
    expect(data.get("manual-sentinel")).toBe("keep");
    const restored = new LabHistory({
      getItem: (k) => data.get(k) || null,
      setItem: () => {},
    });
    expect(restored.records).toEqual(h.records);
  });
  it("storage errors and malformed history never stop gameplay or export", () => {
    const h = new LabHistory({
      getItem: () => "[{}]",
      setItem: () => {
        throw Error("quota");
      },
    });
    expect(h.records).toEqual([]);
    h.save(recordRun(session(), "test", "2026-11-16T00:00:00Z"));
    expect(h.warning).not.toBe("");
    expect(h.records).toHaveLength(1);
  });
});
