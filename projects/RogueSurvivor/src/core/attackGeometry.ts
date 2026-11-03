import type { Vec, Zone } from "./types";
export function zoneContains(z: Zone, p: Vec, padding = 16) {
  const dx = p.x - z.x,
    dy = p.y - z.y,
    a = z.shape?.angle || 0;
  if (z.shape?.kind === "bar") {
    const x = dx * Math.cos(a) + dy * Math.sin(a),
      y = -dx * Math.sin(a) + dy * Math.cos(a);
    return (
      Math.abs(x) <= z.shape.length / 2 + padding &&
      Math.abs(y) <= z.r + padding
    );
  }
  if (z.shape?.kind === "fan") {
    const d = Math.hypot(dx, dy),
      delta = Math.atan2(
        Math.sin(Math.atan2(dy, dx) - a),
        Math.cos(Math.atan2(dy, dx) - a),
      );
    return (
      d <= z.r + padding &&
      (d <= padding ||
        Math.abs(delta) <=
          z.shape.halfAngle + Math.asin(Math.min(1, padding / d)))
    );
  }
  return Math.hypot(dx, dy) < z.r + padding;
}
