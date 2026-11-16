import { createRun } from "../core/create";
import type { MapId } from "../data/maps";
import type { Mode } from "../core/types";
import {
  AIController,
  createPolicy,
  ObservedWorld,
  type PolicyId,
} from "./controller";
import { FIXED_DT, SimulationClock } from "./clock";
export interface LabConfig {
  policy: PolicyId;
  map: MapId;
  character: string;
  mode: Mode;
  seed: number;
}
/** Shared fixed-step pump for visible playback and browser-side headless batches. */
export class LabSession {
  readonly world: ObservedWorld;
  readonly controller: AIController;
  readonly clock = new SimulationClock();
  ended = false;
  fastTicks = 0;
  actualSpeed = 0;
  private measuredWall = 0;
  private measuredGame = 0;
  constructor(readonly config: LabConfig) {
    this.world = new ObservedWorld(
      createRun(
        config.mode,
        config.character,
        config.seed,
        config.character === "knight" ? "ice" : "fire",
        "bloom",
        config.map,
      ),
    );
    this.controller = new AIController(createPolicy(config.policy));
    this.world.onSkill = (event) => this.controller.recordSkill(event);
  }
  get paused() {
    return this.clock.paused;
  }
  set paused(value: boolean) {
    this.clock.paused = value;
    this.clock.reset();
    this.measuredWall = this.measuredGame = 0;
    this.actualSpeed = 0;
  }
  step(allowPresentation = true) {
    if (this.ended) return false;
    this.controller.manage(this.world);
    const phase = this.world.s.phase;
    if (phase === "dead" || phase === "victory") {
      this.ended = true;
      return false;
    }
    if (phase === "dying" || phase === "reviving") {
      if (!allowPresentation) return false;
      this.world.advancePresentation(FIXED_DT);
    } else if (phase === "playing")
      this.world.step(FIXED_DT, this.controller.input(this.world));
    if (this.world.s.phase === "dead" || this.world.s.phase === "victory")
      this.ended = true;
    return true;
  }
  advance(realSeconds: number, allowPresentation = true) {
    if (this.paused || this.ended) return { ticks: 0, gameSeconds: 0 };
    const before = this.world.s.time;
    let ticks = 0;
    if (this.fastTicks > 0) {
      const start = performance.now();
      while (
        this.fastTicks > 0 &&
        ticks < 48 &&
        (ticks === 0 || performance.now() - start < 8)
      ) {
        if (!this.step(allowPresentation)) {
          this.fastTicks = 0;
          break;
        }
        this.fastTicks--;
        ticks++;
      }
      this.clock.reset();
    } else
      ticks = this.clock.advance(realSeconds, () =>
        this.step(allowPresentation),
      );
    const gameSeconds = this.world.s.time - before;
    this.measuredWall += realSeconds;
    this.measuredGame += gameSeconds;
    if (this.measuredWall >= 0.75) {
      this.actualSpeed = this.measuredGame / this.measuredWall;
      this.measuredWall = this.measuredGame = 0;
    }
    return { ticks, gameSeconds };
  }
  queueThirtySeconds() {
    if (!this.ended) {
      this.fastTicks = 1800;
      this.paused = false;
    }
  }
}
