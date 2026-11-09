import type { Run } from "./types";
export interface BuildState {
  schema: 1;
  focusId: number;
  focusHits: number;
  hunt: boolean;
  twinHits: number;
  twinReady: number;
  fractureReady: number;
  orbitReady: number;
  chainReady: number;
  steamReady: number;
  dashUntil: number;
  draws: {
    level: number;
    positive: number;
    negative: number;
    replacement: number;
    refresh: number;
  };
  compensation: number;
}
export function buildState(s: Run): BuildState {
  if (s.build) s.build.twinReady ??= 0;
  return (s.build ||= {
    schema: 1,
    focusId: 0,
    focusHits: 0,
    hunt: false,
    twinHits: 0,
    twinReady: 0,
    fractureReady: 0,
    orbitReady: 0,
    chainReady: 0,
    steamReady: 0,
    dashUntil: 0,
    draws: { level: 0, positive: 0, negative: 0, replacement: 0, refresh: 0 },
    compensation: 0,
  });
}
export function clearMechanics(s: Run) {
  const b = buildState(s);
  b.focusId = 0;
  b.focusHits = 0;
  b.hunt = false;
  b.twinHits = 0;
  b.twinReady = 0;
  b.fractureReady = 0;
  b.orbitReady = 0;
  b.chainReady = 0;
  b.steamReady = 0;
  b.dashUntil = 0;
}
