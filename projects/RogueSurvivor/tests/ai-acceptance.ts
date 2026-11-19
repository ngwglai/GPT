/** Evaluate completed experiments; never manufactures matches or retries losing seeds. */
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { summarize } from "../tools/ai/statistics";
import {
  matchesFrozenSources,
  matchesSchedule,
  readManifest,
} from "../tools/ai/manifest";
import type { MatchResult } from "../tools/ai/runner";
const dir = process.argv[2];
if (!dir)
  throw Error(
    "Usage: npm run ai:acceptance -- REPORT_DIRECTORY [FROZEN_SOURCE_DIRECTORY]",
  );
const sourceRoot = process.argv[3] ?? process.cwd();
const rows: MatchResult[] = JSON.parse(
  gunzipSync(readFileSync(join(dir, "runs.json.gz"))).toString(),
);
const manifest = readManifest(dir);
const summary = summarize(rows),
  checks: Record<string, boolean> = {};
const baseline = summary.groups.find((g) => g.policy === "legacy");
checks.frozenSourceMatches = matchesFrozenSources(manifest, sourceRoot);
checks.completeSchedule = matchesSchedule(manifest.jobs, rows);
checks.threeGroups = summary.groups.length === 3 && !!baseline;
checks.independentSeeds =
  !!baseline &&
  rows.filter((r) => r.policy === "legacy").length ===
    new Set(rows.filter((r) => r.policy === "legacy").map((r) => r.seed)).size;
checks.coverage = summary.groups.every((g) => {
  const group = rows.filter((r) => r.policy === g.policy);
  return (
    g.n >= 24 &&
    new Set(group.map((r) => r.map)).size === 4 &&
    new Set(group.map((r) => r.character)).size === 3
  );
});
checks.normalRules = rows.every(
  (r) =>
    r.hz === 60 &&
    r.decisionHz === 20 &&
    r.mode === "standard" &&
    r.limitSeconds === 1800 &&
    r.seconds <= 1800.02 &&
    r.victory === (r.phase === "victory") &&
    (!r.victory || r.bosses >= 4),
);
checks.samePairCounts = summary.paired.every((p) => p.pairs === baseline?.n);
checks.improvedSurvival = summary.paired.every(
  (p) =>
    p.pairs >= 24 &&
    p.gainBootstrap95[0] > 0 &&
    p.pairedSignTestTwoSidedP < 0.05,
);
checks.improvedWaves = summary.groups
  .filter((g) => g.policy !== "legacy")
  .every((g) => g.meanWave > (baseline?.meanWave || Infinity));
checks.improvedVictories = summary.groups
  .filter((g) => g.policy !== "legacy")
  .every((g) => g.victories > (baseline?.victories || 0));
const passed = Object.values(checks).every(Boolean);
writeFileSync(
  join(dir, "acceptance.json"),
  JSON.stringify(
    { passed, checks, groups: summary.groups, paired: summary.paired },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify({ passed, checks }, null, 2));
if (!passed) process.exitCode = 1;
