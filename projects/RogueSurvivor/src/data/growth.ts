/** v1.8 tuning shared by gameplay, descriptions and reproducible balance tools. */
export const GROWTH_RULES = {
  weaponMax: 3,
  weaponDamage: [0, 1, 1.48, 1.92] as readonly number[],
  weaponFrequency: [0, 1, 1.14, 1.25] as readonly number[],
  xpRamp: 1.5,
  xpRampLevels: 14,
  ascend: 0.32,
  burnStep: 0.4,
  frozenStep: 0.4,
  critDamageStep: 0.3,
  critDamageMax: 6,
  critBase: 2,
  burnCritShare: 0.3,
  burnCritLimit: 2.8,
  conditionStep: 0.25,
  bladeEvolutionRadius: 45,
  emberRadius: 55,
  emberEvolutionRadius: 100,
  evolvedBowArrows: 1,
  evolvedSatellites: 2,
};
export function experienceRequired(level: number) {
  const n = Math.max(
    1,
    Math.min(1e12, Math.floor(Number.isFinite(level) ? level : 1)),
  );
  const base = 18 + n * 12 + Math.floor(Math.sqrt(n) * 8);
  return Math.min(
    1e12,
    Math.ceil(
      base *
        (1 +
          GROWTH_RULES.xpRamp *
            (1 - Math.exp(-Math.max(0, n - 3) / GROWTH_RULES.xpRampLevels))),
    ),
  );
}
export const evolved = (rank: number) => rank >= GROWTH_RULES.weaponMax;
