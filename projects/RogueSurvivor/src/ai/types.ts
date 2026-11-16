import type { Input, Run } from "../core/types";
/** Only current, player-observable facts. No RNG, spawn schedule or future rollout. */
export type ReadonlyTree<T> = T extends object
  ? { readonly [K in keyof T]: ReadonlyTree<T[K]> }
  : T;
export type Observation = ReadonlyTree<
  Pick<
    Run,
    | "time"
    | "phase"
    | "mode"
    | "character"
    | "player"
    | "enemies"
    | "bullets"
    | "zones"
    | "rocks"
    | "gems"
    | "choices"
    | "stats"
    | "environment"
    | "wave"
    | "fate"
    | "deck"
    | "build"
    | "revival"
    | "rewardDrops"
  >
>;
export function observe(s: Run): Observation {
  const {
    time,
    phase,
    mode,
    character,
    player,
    enemies,
    bullets,
    zones,
    rocks,
    gems,
    choices,
    stats,
    environment,
    wave,
    fate,
    deck,
    build,
    revival,
    rewardDrops,
  } = s;
  return {
    time,
    phase,
    mode,
    character,
    player,
    enemies,
    bullets,
    zones,
    rocks,
    gems,
    choices,
    stats,
    environment,
    wave,
    fate,
    deck,
    build,
    revival,
    rewardDrops,
  };
}
export interface CardDecision {
  id: string;
  refresh: boolean;
  scores: { id: string; score: number; reason: string }[];
}
export interface Policy {
  readonly name: string;
  act(s: Observation): Input;
  choose(s: Observation): CardDecision;
  setDebug?(enabled: boolean): void;
  readonly debug?: import("./diagnostics").DecisionDebug;
}
