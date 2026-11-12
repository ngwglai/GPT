/** v1.8.3. Input time is simulation seconds; all slopes are per minute. */
export const ENEMY_GROWTH = {
  normal: {
    hpPerMinute: 0.2,
    damagePerMinute: 0.16,
    attackRatePerMinute: 0.1,
    speedPerMinute: 0.012,
  },
  elite: { initial: 0.03, perMinute: 0.006, maximum: 0.48 },
  boss: {
    graceMinutes: 5,
    initialHp: 3,
    hpPerMinute: 0.6,
    initialDamage: 2,
    damagePerMinute: 0.32,
    attackRatePerMinute: 0.1,
    baseInterval: 1.5,
    secondPhaseInterval: 0.8,
  },
} as const;
const minutes = (seconds: number) =>
  Number.isFinite(seconds) ? Math.max(0, seconds) / 60 : 0;
export function enemyGrowth(time: number) {
  const t = minutes(time),
    n = ENEMY_GROWTH.normal,
    e = ENEMY_GROWTH.elite;
  return {
    hp: 1 + n.hpPerMinute * t,
    damage: 1 + n.damagePerMinute * t,
    attackRate: 1 + n.attackRatePerMinute * t,
    speed: 1 + n.speedPerMinute * t,
    elite: Math.min(e.initial + e.perMinute * t, e.maximum),
  };
}
const bossMinutes = (time: number) =>
  Math.max(0, minutes(time) - ENEMY_GROWTH.boss.graceMinutes);
export function bossHpMultiplier(time: number) {
  const b = ENEMY_GROWTH.boss;
  return b.initialHp + b.hpPerMinute * bossMinutes(time);
}
export function bossDamageMultiplier(time: number) {
  const b = ENEMY_GROWTH.boss;
  return b.initialDamage + b.damagePerMinute * bossMinutes(time);
}
export function bossAttackRate(time: number) {
  return 1 + ENEMY_GROWTH.boss.attackRatePerMinute * bossMinutes(time);
}
export function bossAttackInterval(time: number, secondPhase: boolean) {
  const b = ENEMY_GROWTH.boss;
  return (
    (b.baseInterval / bossAttackRate(time)) *
    (secondPhase ? b.secondPhaseInterval : 1)
  );
}
