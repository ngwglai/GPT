import type { Enemy, Run, Vec, WeaponId } from "./types";
import { distance, segmentDistance } from "./math";
const threat: Partial<Record<Enemy["kind"], number>> = {
  fairy: 155,
  protector: 110,
  summoner: 155,
  hexer: 90,
  shaman: 90,
};
export function selectTarget(
  s: Run,
  weapon: WeaponId,
  range: number,
  previous?: number,
): Enemy | undefined {
  const p = s.player;
  let target: Enemy | undefined,
    score = -Infinity;
  for (const e of s.enemies) {
    const d = distance(p, e);
    if (e.hp <= 0 || d >= range) continue;
    if (s.rocks.some((r) => segmentDistance(r, p, e) < r.r + 3)) continue;
    const value =
      -d +
      (weapon === "bow" || weapon === "drone"
        ? threat[e.kind] || 0
        : (threat[e.kind] || 0) * 0.3) +
      (e.id === previous ? 40 : 0) +
      (1 - e.hp / e.maxHp) * 18;
    if (value > score) {
      score = value;
      target = e;
    }
  }
  return target;
}
export function frontalFactor(e: Enemy, origin?: Vec) {
  if (e.kind !== "crab") return 1;
  if (!origin) return 0.8;
  const a =
    Math.atan2(origin.y - e.y, origin.x - e.x) - (e.behavior?.facing || 0);
  return Math.cos(a) >= 0.5 ? 0.35 : 1;
}
