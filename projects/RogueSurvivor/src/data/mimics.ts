import { LIMITS } from "./content";
/** Only existing, uniformly weighted positive garden candy effects. */
export const MIMIC_RULES = {
  wakeRange: 190,
  escapeMin: 0.8,
  escapeMax: 2,
  rewardCapacity: LIMITS.enemies,
  positiveCandies: ["speed", "haste", "heal", "xp"] as const,
};
