import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { matchesSchedule, readManifest } from "./manifest";
import type { Manifest } from "./manifest";
import { summarize } from "./statistics";
import type { MatchResult } from "./runner";
const args = process.argv.slice(2),
  out = resolve(args.shift() || "validation/ai-player");
if (!args.length)
  throw Error("Usage: tsx tools/ai/report.ts OUTPUT INPUT_DIR [...INPUT_DIR]");
const rows: MatchResult[] = [];
let manifest: Manifest | undefined;
for (const dir of args) {
  const input = readManifest(dir);
  const results = readdirSync(dir)
    .sort()
    .filter(
      (name) =>
        name.endsWith(".json") &&
        ![
          "summary.json",
          "manifest.json",
          "matches.json",
          "acceptance.json",
        ].includes(name),
    )
    .map(
      (name) =>
        JSON.parse(readFileSync(join(dir, name), "utf8")) as MatchResult,
    );
  if (!matchesSchedule(input.jobs, results))
    throw Error("Benchmark results do not match the manifest schedule");

  if (!manifest) {
    manifest = input;
  } else {
    if (
      manifest.fingerprint !== input.fingerprint ||
      manifest.engineBase !== input.engineBase ||
      manifest.node !== input.node ||
      manifest.fixedStep !== input.fixedStep ||
      manifest.stress !== input.stress ||
      manifest.externalApi !== input.externalApi
    )
      throw Error("Benchmark inputs have incompatible manifests");
    manifest.jobs.push(...input.jobs);
    manifest.balanced = false;
    if (manifest.decisionHz !== input.decisionHz) delete manifest.decisionHz;
  }
  rows.push(...results);
}
if (!manifest || !matchesSchedule(manifest.jobs, rows))
  throw Error("Combined benchmark schedule contains overlaps");
mkdirSync(out, { recursive: true });
const staged = mkdtempSync(join(out, ".report-"));
try {
  writeFileSync(
    join(staged, "runs.json.gz"),
    gzipSync(JSON.stringify(rows) + "\n", { level: 9 }),
  );
  const restored = JSON.parse(
    gunzipSync(readFileSync(join(staged, "runs.json.gz"))).toString(),
  );
  if (restored.length !== rows.length) throw Error("Archive validation failed");
  writeFileSync(
    join(staged, "summary.json"),
    JSON.stringify(summarize(rows), null, 2) + "\n",
  );
  const compact = rows.map(({ cards, hits, finalScene, telemetry, ...r }) => ({
    ...r,
    cards: cards.map(({ scores, ...c }) => c),
    hitCount: hits.length,
    deathHit: r.phase === "dead" ? hits.at(-1) : null,
    meanDecisionMs: telemetry.meanDecisionMs,
    wallSeconds: telemetry.wallSeconds,
    remainingEnemies: finalScene.enemies.length,
  }));
  writeFileSync(
    join(staged, "matches.json"),
    JSON.stringify(compact, null, 2) + "\n",
  );
  writeFileSync(
    join(staged, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  // Prevent a previous verdict from describing a replacement report.
  rmSync(join(out, "acceptance.json"), { force: true });
  for (const name of [
    "runs.json.gz",
    "summary.json",
    "matches.json",
    "manifest.json",
  ])
    renameSync(join(staged, name), join(out, name));
} finally {
  rmSync(staged, { recursive: true, force: true });
}
console.log(
  JSON.stringify({
    matches: rows.length,
    archiveBytes: readFileSync(join(out, "runs.json.gz")).length,
  }),
);
