import { describe, it, expect } from "vitest";
import { addExperienceGem } from "../src/core/gems";
import { createRun } from "../src/core/create";
import { LIMITS } from "../src/data/content";
import { validateRun } from "../src/services/storage";
describe("experience consolidation", () => {
  it("merges nearby drops exactly, preserves distant drops and survives saving", () => {
    const s = createRun("standard");
    expect(addExperienceGem(s, { x: 100, y: 100 }, 5)).toBe(0);
    expect(addExperienceGem(s, { x: 110, y: 100 }, 7)).toBe(0);
    addExperienceGem(s, { x: 300, y: 100 }, 9);
    expect(s.gems.map((g) => g.value)).toEqual([12, 9]);
    expect(validateRun(s).gems.reduce((n, g) => n + g.value, 0)).toBe(21);
  });
  it("fills only legal slots at the cap without clipping a full gem", () => {
    const s = createRun("standard");
    s.gems = Array.from({ length: LIMITS.gems }, (_, i) => ({
      x: i,
      y: 0,
      value: LIMITS.number,
    }));
    s.gems[10].value = 10;
    expect(addExperienceGem(s, { x: 0, y: 0 }, 5)).toBe(0);
    expect(s.gems[0].value).toBe(LIMITS.number);
    expect(s.gems[10].value).toBe(15);
    s.gems[10].value = LIMITS.number;
    expect(addExperienceGem(s, { x: 0, y: 0 }, 5)).toBe(5);
    expect(s.gems.length).toBe(LIMITS.gems);
  });
});
