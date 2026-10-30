import type { Run, Vec } from "./types";
import { ensureDeck, type DrawKind } from "./deckState";
import { random, distance, unit } from "./math";
export interface RewardDrop extends Vec {
  kind: DrawKind;
  count: number;
}
export const DROP_RULES = {
  normal: { positive: 0.002, negative: 0.0004 },
  elite: { positive: 0.025, negative: 0.008 },
  boss: { positive: 0.75, negative: 0.15 },
  perMinute: { positive: 8, negative: 3 },
  perKindObjects: 16,
};
export function placeDrop(s: Run, point: Vec, kind: DrawKind, count = 1) {
  if (
    !["positive", "negative"].includes(kind) ||
    !Number.isInteger(count) ||
    count <= 0 ||
    count > 1e12 ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y)
  )
    throw new Error("额外抽卡掉落参数无效");
  const d = ensureDeck(s);
  if (
    d.earned[kind] +
      (s.rewardDrops || [])
        .filter((x) => x.kind === kind)
        .reduce((n, x) => n + x.count, 0) +
      count >
    1e12
  )
    throw new Error("额外抽卡累计数量已达安全边界");
  const drops = (s.rewardDrops ||= []);
  const same = drops.filter((d) => d.kind === kind);
  if (same.length < DROP_RULES.perKindObjects)
    drops.push({ ...point, kind, count });
  else {
    let nearest = same[0];
    for (const d of same)
      if (distance(d, point) < distance(nearest, point)) nearest = d;
    nearest.count += count;
  }
}
export function rollDrops(
  s: Run,
  point: Vec,
  tier: "normal" | "elite" | "boss",
) {
  const d = ensureDeck(s),
    window = Math.floor(s.time / 60);
  if (window !== d.dropWindow) {
    d.dropWindow = window;
    d.dropsInWindow = { positive: 0, negative: 0 };
  }
  for (const kind of ["positive", "negative"] as const)
    if (
      d.dropsInWindow[kind] < DROP_RULES.perMinute[kind] &&
      d.earned[kind] +
        (s.rewardDrops || [])
          .filter((x) => x.kind === kind)
          .reduce((n, x) => n + x.count, 0) <
        1e12 &&
      random(s) < DROP_RULES[tier][kind]
    ) {
      placeDrop(s, point, kind);
      d.dropsInWindow[kind]++;
    }
}
export function collectDrops(s: Run, dt: number) {
  if (!s.rewardDrops?.length) return;
  const d = ensureDeck(s),
    p = s.player;
  for (const drop of s.rewardDrops || []) {
    const dist = distance(drop, p);
    if (dist < p.magnet) {
      const dir = unit(p.x - drop.x, p.y - drop.y),
        step = Math.min(dist, 460 * dt);
      drop.x += dir.x * step;
      drop.y += dir.y * step;
    }
    if (distance(drop, p) < 22) {
      d.pending[drop.kind] += drop.count;
      d.earned[drop.kind] += drop.count;
      drop.count = 0;
    }
  }
  s.rewardDrops = (s.rewardDrops || []).filter((x) => x.count > 0);
}
