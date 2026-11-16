import type { Input, Vec, Zone } from "../core/types";
export interface MotionCandidate {
  direction: Vec;
  dash: boolean;
  path: Vec[];
  score?: number;
  risk?: number;
  early?: number;
  parts?: {
    enemies: number;
    bullets: number;
    zones: number;
    environment: number;
  };
}
/** Captured inside the actual evaluator. No separate prediction or policy is run by the UI. */
export interface DecisionDebug {
  time: number;
  origin: Vec;
  goal: Vec;
  algorithm: "legacy" | "predictive";
  selected: number;
  candidates: MotionCandidate[];
  dangers: Zone[];
  nearestEnemy?: { kind: string; distance: number; damage: number };
  immediateDanger?: boolean;
}
export interface SkillEvent {
  sequence: number;
  time: number;
  skill: string;
  slot: number;
  target: Vec;
}
export function copyInput(input: Input): Input {
  return {
    ...input,
    aim: { ...input.aim },
    skills: input.skills && [...input.skills],
    skillAims: input.skillAims?.map((p) => p && { ...p }),
  };
}
