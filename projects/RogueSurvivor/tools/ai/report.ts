import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { summarize } from "./statistics";
import type { MatchResult } from "./runner";
const args = process.argv.slice(2),
  out = resolve(args.shift() || "validation/ai-player");
if (!args.length)
  throw Error("Usage: tsx tools/ai/report.ts OUTPUT INPUT_DIR [...INPUT_DIR]");
mkdirSync(out, { recursive: true });
const rows: MatchResult[] = [];
for (const dir of args) {
  for (const file of readdirSync(dir).sort()) {
    if (
      !file.endsWith(".json") ||
      ["summary.json", "manifest.json"].includes(file)
    )
      continue;
    rows.push(JSON.parse(readFileSync(join(dir, file), "utf8")));
  }
}
if (!rows.length) throw Error("No matches");
writeFileSync(
  join(out, "runs.json.gz"),
  gzipSync(JSON.stringify(rows) + "\n", { level: 9 }),
);
const restored = JSON.parse(
  gunzipSync(readFileSync(join(out, "runs.json.gz"))).toString(),
);
if (restored.length !== rows.length) throw Error("Archive validation failed");
writeFileSync(
  join(out, "summary.json"),
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
  join(out, "matches.json"),
  JSON.stringify(compact, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    matches: rows.length,
    archiveBytes: readFileSync(join(out, "runs.json.gz")).length,
  }),
);
