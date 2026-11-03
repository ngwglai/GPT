import { segmentDistance } from "./math";
import type { Vec, Zone } from "./types";
export function zoneContains(z: Zone, p: Vec, padding = 16) {
  const dx = p.x - z.x,
    dy = p.y - z.y,
    a = z.shape?.angle || 0;
  if (z.shape?.kind === "bar") {
    const x = dx * Math.cos(a) + dy * Math.sin(a),
      y = -dx * Math.sin(a) + dy * Math.cos(a);
    return (
      Math.hypot(
        Math.max(0, Math.abs(x) - z.shape.length / 2),
        Math.max(0, Math.abs(y) - z.r),
      ) <= padding
    );
  }
  if (z.shape?.kind === "fan") {
    const d = Math.hypot(dx, dy),
      delta = Math.atan2(
        Math.sin(Math.atan2(dy, dx) - a),
        Math.cos(Math.atan2(dy, dx) - a),
      );
    if (d <= z.r && Math.abs(delta) <= z.shape.halfAngle) return true;
    if (Math.abs(delta) <= z.shape.halfAngle && Math.abs(d - z.r) <= padding)
      return true;
    return [-1, 1].some((sign) => {
      const angle = a + sign * z.shape!.halfAngle;
      return (
        segmentDistance(p, z, {
          x: z.x + Math.cos(angle) * z.r,
          y: z.y + Math.sin(angle) * z.r,
        }) <= padding
      );
    });
  }
  return Math.hypot(dx, dy) < z.r + padding;
}
