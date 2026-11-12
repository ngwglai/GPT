import type { Enemy } from "./types";
export function behavior(e: Enemy) {
  return (e.behavior ??= {
    facing: 0,
    shield: 0,
    shieldTime: 0,
    shieldOwner: 0,
    summonOwner: 0,
    child: false,
    rewardless: false,
    warning: 0,
    target: null,
    reflecting: 0,
    awakened: false,
    copied: [],
    copyShots: 0,
    healUntil: 0,
  });
}
