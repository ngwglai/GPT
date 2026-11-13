import type { Run, Effect, Vec } from "../core/types";
import { bossEffect, skillEffect, FX_DEPTH } from "../data/effects";
import type { VisualPulse } from "./battleFeedback";
export type FxDraw = (
  name: string,
  p: Vec,
  width: number,
  height?: number,
  angle?: number,
  alpha?: number,
  progress?: number,
  depth?: number,
  essential?: boolean,
) => boolean;
const TRANSIENT_EFFECTS: Record<string, string> = {
  slash: "slash",
  orbit: "slash",
  fire: "starfall",
  ice: "frost",
  lance: "lance",
  ward: "shield",
  bloom: "heal",
  storm: "starfall",
  hurt: "critical",
  heal: "heal",
  shield: "shield",
  portal: "mirror",
  reflect: "mirror",
  warning: "warning",
  crystal: "frost",
  candy: "candy",
  mimicEscape: "candy",
  pickup: "hit",
  revive: "revive",
  critical: "critical",
};
export function transientEffect(kind: string): string | undefined {
  return TRANSIENT_EFFECTS[kind];
}
/** One bounded pass of painted materials. Danger outlines remain in GameScene. */
export function paintBattleEffects(
  s: Run,
  effects: readonly Effect[],
  pulses: readonly VisualPulse[],
  draw: FxDraw,
  presentation: number,
) {
  const p = s.player,
    t = s.time;
  // Critical player states get first access to the optional decoration budget.
  if (s.phase === "reviving")
    draw(
      "revive",
      p,
      100 + Math.min(1, presentation) * 85,
      undefined,
      -presentation * 0.8,
      0.7,
      undefined,
      9,
    );
  else if (s.phase === "dying" || s.phase === "revive")
    draw("dissolve", p, 105, undefined, presentation * 0.25, 0.5, undefined, 9);
  if (p.shield > 0)
    draw("shield", p, 98, undefined, t * 0.12, 0.65, undefined, 9);
  if (p.dash > 0)
    draw(
      "dash",
      { x: p.x - p.dx * 30, y: p.y - p.dy * 30 },
      115,
      55,
      Math.atan2(p.dy, p.dx),
      0.8,
      undefined,
      9,
    );
  else if (p.invincible > 0 && s.phase === "playing")
    draw("revive", p, 72, undefined, -t * 0.3, 0.3, undefined, 9);
  const buffs = s.environment?.buffs || [];
  if (
    buffs.some((b) => b.life > 0 && ["haste", "speed", "moon"].includes(b.kind))
  )
    draw("heal", p, 64, undefined, t * 0.18, 0.35, undefined, 1);
  if ((p.upgrades.armor || 0) > 0)
    draw("phase", p, 63, undefined, 0, 0.22, undefined, 1);
  for (const z of s.zones) {
    const h = z.shape,
      warning = z.delay > 0;
    if (z.enemy) {
      const art = bossEffect(z.source, h?.kind);
      if (h?.kind === "bar")
        draw(
          art,
          z,
          h.length,
          z.r * 2,
          h.angle,
          warning ? 0.16 : 0.5,
          undefined,
          11,
        );
      else if (h?.kind === "fan") {
        // The artwork is inscribed within the real sector; it never replaces its boundary.
        const center = {
          x: z.x + Math.cos(h.angle) * z.r * 0.52,
          y: z.y + Math.sin(h.angle) * z.r * 0.52,
        };
        draw(
          art,
          center,
          z.r * 0.78,
          z.r * Math.sin(h.halfAngle) * 0.8,
          h.angle,
          warning ? 0.18 : 0.5,
          undefined,
          11,
        );
      } else {
        draw(
          "warning",
          z,
          z.r * 1.9,
          undefined,
          t * 0.12,
          warning ? 0.22 : 0.38,
          undefined,
          11,
        );
        if (!warning && art !== "warning")
          draw(art, z, z.r * 1.15, undefined, t * 0.08, 0.4, undefined, 11);
      }
    } else {
      draw(
        skillEffect(z.kind),
        z,
        z.r * 1.9,
        undefined,
        z.kind === "lance" ? 0 : t * 0.08,
        warning ? 0.18 : 0.34,
        undefined,
        FX_DEPTH.ground,
      );
      if (warning && (z.kind === "fire" || z.kind === "storm"))
        draw(
          z.kind === "fire" ? "meteor" : "starfall",
          { x: z.x - 30 * z.delay, y: z.y - 110 * z.delay },
          Math.min(100, z.r),
          undefined,
          0,
          0.65,
          undefined,
          7,
        );
    }
  }
  for (const v of pulses) {
    const progress = v.age / v.duration;
    const name =
      (
        {
          spawn: "mirror",
          hit: "impact",
          level: "phase",
          reward: "critical",
        } as Record<string, string>
      )[v.kind] || v.kind;
    draw(
      name,
      v,
      v.size * (0.8 + progress * 0.25),
      undefined,
      0,
      (1 - progress) * 0.65,
      name === "impact" ? progress : undefined,
      v.kind === "spawn" ? 1 : 7,
    );
  }
  for (const e of effects) {
    const progress = 1 - e.life / e.maxLife;
    const name = transientEffect(e.kind);
    if (name)
      draw(
        name,
        e,
        Math.min(360, e.r * 2) * (0.8 + progress * 0.2),
        undefined,
        e.kind === "slash" ? -Math.PI / 4 : progress * 0.2,
        (1 - progress) * 0.65,
        undefined,
        7,
      );
  }
  for (const e of s.enemies) {
    if (e.elite)
      draw("phase", e, e.r * 3, undefined, t * 0.18, 0.45, undefined, 1);
    if (e.freeze > 0)
      draw("frost", e, e.r * 2.6, undefined, -t * 0.08, 0.45, undefined, 3);
    else if (e.burn > 0)
      draw("fireball", e, e.r * 2, undefined, -Math.PI / 2, 0.45, undefined, 3);
    if (e.behavior?.shield || e.behavior?.reflecting)
      draw(
        e.behavior.shield > 0 ? "shield" : "mirror",
        e,
        e.r * 2.9,
        undefined,
        t * 0.2,
        0.4,
        undefined,
        3,
      );
    if (e.charge)
      draw(
        "fan",
        e,
        Math.min(100, e.r * 3),
        e.r * 2,
        Math.atan2(e.charge.y, e.charge.x),
        0.45,
        undefined,
        11,
      );
  }
  for (const f of s.environment?.fields || [])
    draw(
      f.kind === "eclipse"
        ? "warning"
        : f.kind === "shield"
          ? "shield"
          : "heal",
      f,
      f.r * 1.8,
      undefined,
      t * 0.1,
      f.delay > 0 ? 0.15 : 0.3,
      undefined,
      f.kind === "eclipse" ? 11 : 1,
    );
}
