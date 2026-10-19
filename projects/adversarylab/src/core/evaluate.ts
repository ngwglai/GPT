import type {
  Candidate,
  Config,
  Execution,
  GraphAlgorithm,
  SortAlgorithm,
} from "./types";
import { sort } from "./sorting";
import { graphSearch } from "./graph";
import { validCandidate } from "./space";
export function evaluate(candidate: Candidate, config: Config): Execution {
  if (!validCandidate(candidate, config.space))
    throw new Error("候选违反固定输入约束");
  return candidate.kind === "sort"
    ? sort(candidate.values, config.algorithm as SortAlgorithm)
    : graphSearch(candidate, config.algorithm as GraphAlgorithm);
}
