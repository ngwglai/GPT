import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { MatchOptions, MatchResult } from "./runner";

export interface Manifest {
  schema: 1;
  engineBase: string;
  fingerprint: string;
  node: string;
  fixedStep: boolean;
  decisionHz?: number;
  balanced: boolean;
  stress: boolean;
  externalApi: boolean;
  jobs: MatchOptions[];
  sources: Record<string, string>;
}

export function sourceFingerprint(sources: Manifest["sources"]) {
  return createHash("sha256").update(JSON.stringify(sources)).digest("hex");
}

export function readManifest(directory: string): Manifest {
  const manifest: Manifest = JSON.parse(
    readFileSync(join(directory, "manifest.json"), "utf8"),
  );
  if (
    manifest?.schema !== 1 ||
    !Array.isArray(manifest.jobs) ||
    !manifest.jobs.length ||
    !manifest.sources ||
    !Object.keys(manifest.sources).length ||
    !Object.entries(manifest.sources).every(
      ([file, hash]) =>
        /^(?:src\/(?:ai|core|data)|tools\/ai)\/(?:[\w-]+\/)*[\w.-]+\.(?:ts|mjs)$/.test(
          file,
        ) &&
        typeof hash === "string" &&
        /^[a-f0-9]{64}$/.test(hash),
    ) ||
    sourceFingerprint(manifest.sources) !== manifest.fingerprint
  )
    throw Error("Invalid benchmark manifest");
  return manifest;
}

function scheduleKey(options: MatchOptions, seconds: number) {
  if (
    !options ||
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    typeof options.policy !== "string" ||
    !options.policy ||
    !["forest", "cavern", "garden", "eclipse"].includes(options.map) ||
    !["ranger", "knight", "mage"].includes(options.character) ||
    !Number.isInteger(options.seed) ||
    options.seed < 0 ||
    options.seed > 0xffffffff ||
    !["standard", "endless"].includes(options.mode) ||
    ![20, 60].includes(options.hz ?? 0) ||
    ![10, 20].includes(options.decisionHz ?? 0)
  )
    return null;
  return JSON.stringify([
    options.policy,
    options.map,
    options.character,
    options.seed,
    options.mode,
    options.hz,
    options.decisionHz,
    seconds,
  ]);
}

export function matchesSchedule(jobs: MatchOptions[], rows: MatchResult[]) {
  if (!jobs.length || jobs.length !== rows.length) return false;
  const expected = new Set(jobs.map((job) => scheduleKey(job, job?.seconds)));
  return (
    expected.size === jobs.length &&
    !expected.has(null) &&
    rows.every((row) => expected.delete(scheduleKey(row, row?.limitSeconds)))
  );
}

export function hashBenchmarkSources(root: string): Manifest["sources"] {
  function files(directory: string): string[] {
    return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(
      (entry) => {
        const file = directory + "/" + entry.name;
        if (entry.isDirectory()) return files(file);
        return entry.isFile() && /\.(ts|mjs)$/.test(file) ? [file] : [];
      },
    );
  }
  return Object.fromEntries(
    ["src/core", "src/data", "src/ai", "tools/ai"]
      .flatMap(files)
      .sort()
      .map((file) => [
        file,
        createHash("sha256")
          .update(readFileSync(join(root, file)))
          .digest("hex"),
      ]),
  );
}

export function matchesFrozenSources(manifest: Manifest, root: string) {
  try {
    const actual = hashBenchmarkSources(root);
    return (
      Object.keys(actual).length === Object.keys(manifest.sources).length &&
      Object.entries(manifest.sources).every(
        ([file, hash]) => actual[file] === hash,
      )
    );
  } catch {
    return false;
  }
}
