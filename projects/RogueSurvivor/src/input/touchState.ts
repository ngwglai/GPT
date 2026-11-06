import type { Run, SkillId, Vec } from "../core/types";
import { SKILLS } from "../data/content";
import { selectTarget } from "../core/targeting";

/** Pointer ownership and one-shot commands; independent of DOM, physics and saved state. */
export class TouchState {
  pointer: number | null = null;
  vector: Vec = { x: 0, y: 0 };
  knob: Vec = { x: 0, y: 0 };
  target?: Vec;
  skills = new Map<number, boolean>();
  dash = false;
  begin(id: number) {
    if (this.pointer !== null) return false;
    this.pointer = id;
    return true;
  }
  move(id: number, dx: number, dy: number, radius: number) {
    if (
      id !== this.pointer ||
      !Number.isFinite(dx + dy + radius) ||
      radius <= 0
    )
      return;
    const length = Math.hypot(dx, dy),
      scale = length ? Math.min(radius, length) / length : 0;
    this.knob = { x: dx * scale, y: dy * scale };
    // World uses full-speed normalized movement for keyboard and touch alike.
    this.vector =
      length <= radius * 0.16
        ? { x: 0, y: 0 }
        : { x: dx / length, y: dy / length };
  }
  end(id: number) {
    if (id !== this.pointer) return false;
    this.pointer = null;
    this.vector = { x: 0, y: 0 };
    this.knob = { x: 0, y: 0 };
    return true;
  }
  reset(clearTarget = true) {
    this.pointer = null;
    this.vector = { x: 0, y: 0 };
    this.knob = { x: 0, y: 0 };
    this.skills.clear();
    this.dash = false;
    if (clearTarget) this.target = undefined;
  }
}
export function canvasPoint(
  client: Vec,
  rect: { left: number; top: number; width: number; height: number },
  size: Vec,
  player: Vec,
): Vec {
  return {
    x:
      player.x +
      ((client.x - rect.left) * size.x) / Math.max(1, rect.width) -
      size.x / 2,
    y:
      player.y +
      ((client.y - rect.top) * size.y) / Math.max(1, rect.height) -
      size.y / 2,
  };
}
export function clampAim(player: Vec, point: Vec): Vec {
  const dx = point.x - player.x,
    dy = point.y - player.y,
    d = Math.hypot(dx, dy),
    scale = d > 450 ? 450 / d : 1;
  return { x: player.x + dx * scale, y: player.y + dy * scale };
}
export function touchAim(
  run: Run,
  skill: SkillId,
  point?: Vec,
  movement?: Vec,
): Vec {
  const p = run.player,
    mode = SKILLS[skill].aim;
  if (mode === "self") return { x: p.x, y: p.y };
  if (point) return clampAim(p, point);
  const enemy = selectTarget(run, mode === "direction" ? "bow" : "blade", 450);
  if (enemy) return { x: enemy.x, y: enemy.y };
  if (mode === "area") return { x: p.x, y: p.y };
  const direction =
    movement && Math.hypot(movement.x, movement.y) > 0
      ? movement
      : { x: p.dx, y: p.dy };
  const d = Math.hypot(direction.x, direction.y) || 1;
  return { x: p.x + (direction.x / d) * 240, y: p.y + (direction.y / d) * 240 };
}
export function touchVisible(
  mode: "auto" | "on" | "off",
  coarse: boolean,
  points: number,
) {
  return mode === "on" || (mode !== "off" && (coarse || points > 0));
}
