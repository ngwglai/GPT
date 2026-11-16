import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";
import {
  runMatch,
  policies,
  type MatchOptions,
  type MatchResult,
} from "./runner";
import { summarize } from "./statistics";
const arg = (key: string, fallback: string) =>
  process.argv.includes(key)
    ? process.argv[process.argv.indexOf(key) + 1]
    : fallback;
if (!isMainThread) {
  parentPort!.postMessage(runMatch(workerData as MatchOptions));
} else {
  const out = resolve(arg("--output", "../../work/ai/benchmark"));
  mkdirSync(out, { recursive: true });
  const modes = arg("--policies", "legacy,combat-v3,build-v4").split(",");
  const characters = arg("--characters", "ranger,knight,mage").split(",");
  const maps = arg("--maps", "forest").split(",") as MatchOptions["map"][];
  const seeds = arg("--seeds", "11,29,83").split(",").map(Number);
  let jobs: MatchOptions[] = modes.flatMap((policy) =>
    maps.flatMap((map) =>
      characters.flatMap((character) =>
        seeds.map((seed) => ({
          policy,
          map,
          character,
          seed,
          mode: arg("--mode", "standard") as MatchOptions["mode"],
          seconds: Number(arg("--seconds", "1800")),
          hz: Number(arg("--hz", "60")) as 20 | 60,
          decisionHz: Number(arg("--decision-hz", "20")) as 10 | 20,
        })),
      ),
    ),
  );
  if (process.argv.includes("--balanced")) {
    // Each seed belongs to exactly one map/character stratum, shared across policies.
    jobs = modes.flatMap((policy) =>
      seeds.map((seed, i) => ({
        ...jobs[0],
        policy,
        seed,
        character: characters[i % characters.length],
        map: maps[Math.floor(i / characters.length) % maps.length],
      })),
    );
  }
  function files(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
    );
  }
  const sources = [
    ...files("src/core"),
    ...files("src/data"),
    ...files("src/ai"),
    ...files("tools/ai"),
  ].filter((f) => /\.(ts|mjs)$/.test(f));
  const hashes = Object.fromEntries(
    sources
      .sort()
      .map((file) => [
        file,
        createHash("sha256").update(readFileSync(file)).digest("hex"),
      ]),
  );
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(hashes))
    .digest("hex");
  const manifest = {
    schema: 1,
    engineBase: "232a8e235c106e88f718e014b9d5bc17065a431f",
    fingerprint,
    node: process.version,
    fixedStep: true,
    decisionHz: jobs[0]?.decisionHz,
    balanced: process.argv.includes("--balanced"),
    stress: false,
    externalApi: false,
    jobs,
    sources: hashes,
  };
  const manifestFile = join(out, "manifest.json");
  if (process.argv.includes("--resume")) {
    const previous = JSON.parse(readFileSync(manifestFile, "utf8"));
    if (
      previous.fingerprint !== fingerprint ||
      JSON.stringify(previous.jobs) !== JSON.stringify(jobs)
    )
      throw Error(
        "Resume rejected: source or schedule changed; use a new output folder.",
      );
  }
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
  if (
    ![20, 60].includes(jobs[0]?.hz || 0) ||
    ![10, 20].includes(jobs[0]?.decisionHz || 0) ||
    jobs.some(
      (j) =>
        !Number.isFinite(j.seconds) ||
        j.seconds <= 0 ||
        !Number.isFinite(j.seed),
    )
  )
    throw Error("Invalid configuration");
  const workers = Number(arg("--workers", "2"));
  if (
    !Number.isInteger(workers) ||
    workers < 1 ||
    workers > 8 ||
    !jobs.length ||
    jobs.some(
      (j) =>
        !policies[j.policy] ||
        !["ranger", "knight", "mage"].includes(j.character) ||
        !["forest", "cavern", "garden", "eclipse"].includes(j.map) ||
        !["standard", "endless"].includes(j.mode) ||
        !Number.isInteger(j.seed) ||
        j.seed < 0 ||
        j.seed > 0xffffffff,
    )
  )
    throw Error("Invalid policy, character, map, mode, seed or worker count");
  if (new Set(jobs.map((j) => JSON.stringify(j))).size !== jobs.length)
    throw Error("Duplicate match configuration");
  const rows: MatchResult[] = [];
  let index = 0;
  async function lane() {
    while (index < jobs.length) {
      const job = jobs[index++];
      const key = [
        job.policy,
        job.map,
        job.character,
        job.seed,
        job.mode,
        job.hz,
        job.decisionHz,
        job.seconds,
      ].join("-");
      const file = join(out, key + ".json");
      const result = process.argv.includes("--resume")
        ? (() => {
            try {
              return JSON.parse(readFileSync(file, "utf8"));
            } catch {
              return null;
            }
          })()
        : null;
      const row: MatchResult =
        result ||
        (await new Promise((done, fail) => {
          const worker = new Worker(new URL("./worker.mjs", import.meta.url), {
            workerData: job,
          });
          worker.on("message", done);
          worker.on("error", fail);
          worker.on("exit", (code) => {
            if (code) fail(Error(`Worker exit ${code}`));
          });
        }));
      writeFileSync(file, JSON.stringify(row) + "\n");
      rows.push(row);
      console.error(
        `${rows.length}/${jobs.length} ${job.policy} ${job.map}/${job.character}/${job.seed} ${row.phase} ${row.seconds.toFixed(1)}s W${row.wave} B${row.bosses} (${row.telemetry.wallSeconds.toFixed(1)} wall s)`,
      );
      writeFileSync(
        join(out, "summary.json"),
        JSON.stringify(summarize(rows), null, 2) + "\n",
      );
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(workers, jobs.length) }, lane),
  );
  console.log(JSON.stringify(summarize(rows), null, 2));
}
