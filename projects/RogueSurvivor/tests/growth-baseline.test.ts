import { it, expect } from "vitest";
import { LIMITS, difficulty, bossAttackInterval } from "../src/data/content";
it("retains extreme-wave capacities and late difficulty", () => {
  expect([LIMITS.enemies, LIMITS.bullets, LIMITS.zones]).toEqual([
    800, 1200, 240,
  ]);
  expect(difficulty(3600).hp).toBe(1000);
  expect(difficulty(3600).attackRate).toBe(12);
  expect(bossAttackInterval(3600, true)).toBeCloseTo(0.16);
});
import { World } from "../src/core/world";
import { createRun } from "../src/core/create";
import { validateRun } from "../src/services/storage";
it("saves all 1200 live projectiles at the configured capacity", () => {
  const w = new World(createRun("endless"));
  for (let i = 0; i < LIMITS.bullets; i++)
    w.shoot(w.s.player, { x: 1, y: 0 }, 1, "bow", "bow");
  expect(w.s.bullets).toHaveLength(1200);
  expect(validateRun(w.s).bullets).toHaveLength(1200);
});
