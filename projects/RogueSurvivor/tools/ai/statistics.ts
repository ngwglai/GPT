import type { MatchResult } from "./runner";
const mean = (x: number[]) =>
  x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const sd = (x: number[]) =>
  x.length < 2
    ? 0
    : Math.sqrt(x.reduce((n, v) => n + (v - mean(x)) ** 2, 0) / (x.length - 1));
const median = (x: number[]) => {
  const s = [...x].sort((a, b) => a - b);
  return s.length
    ? (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2
    : 0;
};
export function bootstrap(x: number[]) {
  if (!x.length) return [0, 0];
  let seed = 1234567;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const means = Array.from({ length: 4000 }, () =>
    mean(x.map(() => x[Math.floor(random() * x.length)])),
  ).sort((a, b) => a - b);
  return [means[100], means[3899]];
}
export function summarize(rows: MatchResult[]) {
  const groups = [...new Set(rows.map((r) => r.policy))]
    .sort()
    .map((policy) => {
      const rs = rows.filter((r) => r.policy === policy),
        seconds = rs.map((r) => r.seconds);
      const causes: Record<string, number> = {};
      for (const r of rs)
        for (const c of r.causes) causes[c] = (causes[c] || 0) + 1;
      const wins = rs.filter((r) => r.victory).length,
        n = rs.length,
        z = 1.96,
        phat = wins / n;
      const mid = (phat + (z * z) / (2 * n)) / (1 + (z * z) / n),
        margin =
          (z * Math.sqrt((phat * (1 - phat)) / n + (z * z) / (4 * n * n))) /
          (1 + (z * z) / n);
      return {
        policy,
        n,
        meanSeconds: mean(seconds),
        medianSeconds: median(seconds),
        sdSeconds: sd(seconds),
        meanSecondsBootstrap95: bootstrap(seconds),
        minSeconds: Math.min(...seconds),
        maxSeconds: Math.max(...seconds),
        victories: wins,
        victoryRate: wins / n,
        victoryWilson95: [mid - margin, mid + margin],
        censored: rs.filter((r) => r.censored).length,
        meanWave: mean(rs.map((r) => r.wave)),
        meanBosses: mean(rs.map((r) => r.bosses)),
        meanKills: mean(rs.map((r) => r.kills)),
        meanTaken: mean(rs.map((r) => r.taken)),
        meanDamage: mean(rs.map((r) => r.damage)),
        meanDecisionMs: mean(rs.map((r) => r.telemetry.meanDecisionMs)),
        causes,
      };
    });
  const key = (r: MatchResult) =>
    [
      r.map,
      r.character,
      r.seed,
      r.mode,
      r.hz,
      r.decisionHz,
      r.limitSeconds,
    ].join(":");
  const base = new Map(
    rows.filter((r) => r.policy === "legacy").map((r) => [key(r), r]),
  );
  const paired = groups
    .filter((g) => g.policy !== "legacy")
    .map((g) => {
      const rs = rows.filter((r) => r.policy === g.policy && base.has(key(r)));
      // Completion time is not a survival duration: successful early clears receive the evaluation cap.
      const utility = (r: MatchResult) =>
        r.victory ? r.limitSeconds : r.seconds;
      const delta = rs.map((r) => utility(r) - utility(base.get(key(r))!));
      const clusters = new Map<number, number[]>();
      rs.forEach((r, i) =>
        clusters.set(r.seed, [...(clusters.get(r.seed) || []), delta[i]]),
      );
      const positive = delta.filter((x) => x > 1e-6).length,
        negative = delta.filter((x) => x < -1e-6).length;
      const n = positive + negative,
        k = Math.min(positive, negative);
      let probability = Math.pow(0.5, n),
        tail = probability;
      for (let i = 1; i <= k; i++) {
        probability *= (n - i + 1) / i;
        tail += probability;
      }
      return {
        policy: g.policy,
        pairs: rs.length,
        metric: "restricted-survival-with-victory-credit",
        meanGain: mean(delta),
        seedClusters: clusters.size,
        seedClusterMeanGain95: bootstrap([...clusters.values()].map(mean)),
        pairedSignTestTwoSidedP: Math.min(1, tail * 2),
        gainBootstrap95: bootstrap(delta),
        wins: delta.filter((x) => x > 1e-6).length,
        losses: delta.filter((x) => x < -1e-6).length,
        ties: delta.filter((x) => Math.abs(x) <= 1e-6).length,
      };
    });
  return {
    method:
      "Identical engine, character, map, loadout, seed, cap, fixed dt and decision cadence. Divergent decisions consume different in-game RNG streams. Bootstrap is over paired runs; map/character strata reported separately. Capped runs are censored, not deaths. Victory-credit statistic prevents penalizing fast clears.",
    groups,
    paired,
    strata: groups.flatMap((g) =>
      [...new Set(rows.map((r) => r.map + "/" + r.character))].map(
        (stratum) => {
          const rs = rows.filter(
            (r) =>
              r.policy === g.policy && r.map + "/" + r.character === stratum,
          );
          return {
            policy: g.policy,
            stratum,
            n: rs.length,
            victories: rs.filter((r) => r.victory).length,
            meanSeconds: mean(rs.map((r) => r.seconds)),
            meanWave: mean(rs.map((r) => r.wave)),
          };
        },
      ),
    ),
  };
}
