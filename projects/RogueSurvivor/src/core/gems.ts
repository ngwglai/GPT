import type { Run, Vec } from "./types";
import { LIMITS } from "../data/content";
import { distance } from "./math";
/** Merge only when the entire reward fits: no clipping or duplicate value. */
export function addExperienceGem(s: Run, point: Vec, value: number) {
  let target = s.gems.find(
    (g) => distance(point, g) < 40 && g.value + value <= LIMITS.number,
  );
  if (!target && s.gems.length >= LIMITS.gems)
    target = s.gems
      .filter((g) => g.value + value <= LIMITS.number)
      .reduce<(typeof s.gems)[number] | undefined>(
        (best, g) =>
          !best || distance(point, g) < distance(point, best) ? g : best,
        undefined,
      );
  if (target) target.value += value;
  else if (s.gems.length < LIMITS.gems) s.gems.push({ ...point, value });
  else {
    // At the numeric ceiling all floor slots may be full. Preserve the reward
    // in the existing XP account rather than clipping the contents of a gem.
    return value;
  }
  return 0;
}
