/** Fixed-seed gameplay / stress simulation. Not a human win-rate estimate. */
import { simulate } from "../tests/simulate";
import { mkdirSync, writeFileSync } from "node:fs";
import type { MapId } from "../src/data/maps";
const dir = process.env.WORLD_REPORT_OUT || "validation/v1.4";
mkdirSync(dir, { recursive: true });
const stress = process.argv.includes("--stress");
const maps: MapId[] = ["cavern", "garden", "eclipse"];
const results = [];
for (const map of maps) {
  for (const seed of stress ? [77] : [11, 29]) {
    for (const character of stress ? ["mage"] : ["ranger", "knight", "mage"]) {
      const result = simulate(
        stress ? 7201 : 1500,
        character,
        seed,
        stress,
        stress ? 3600 : undefined,
        map,
      );
      results.push(result);
      console.error(
        map,
        character,
        result.phase,
        result.seconds,
        result.wallSeconds,
      );
    }
  }
}
writeFileSync(
  `${dir}/${stress ? "stress" : "balance"}.json`,
  JSON.stringify(results, null, 2) + "\n",
);
if (stress && results.some((x) => x.seconds < 7200)) process.exitCode = 1;
if (
  !stress &&
  maps.some(
    (map) => !results.some((x) => x.map === map && x.phase === "victory"),
  )
)
  process.exitCode = 1;
