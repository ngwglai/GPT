import type { Vec, Zone } from "../core/types";
import type { DecisionDebug } from "./diagnostics";
export class DecisionOverlay {
  private context: CanvasRenderingContext2D;
  constructor(private canvas: HTMLCanvasElement) {
    this.context = canvas.getContext("2d")!;
  }
  draw(
    debug: DecisionDebug | undefined,
    player: Vec,
    width: number,
    height: number,
    enabled: boolean,
  ) {
    if (!enabled || !debug) {
      if (!this.canvas.hidden) {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.canvas.hidden = true;
      }
      return;
    }
    this.canvas.hidden = false;
    this.canvas.dataset.time = String(debug.time);
    this.canvas.dataset.candidates = String(debug.candidates.length);
    this.canvas.dataset.selected = String(debug.selected);
    const ratio = Math.min(devicePixelRatio || 1, 2);
    if (
      this.canvas.width !== Math.round(width * ratio) ||
      this.canvas.height !== Math.round(height * ratio)
    ) {
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
    }
    const c = this.context;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.clearRect(0, 0, width, height);
    const point = (p: Vec) => ({
      x: p.x - player.x + width / 2,
      y: p.y - player.y + height / 2,
    });
    for (const z of debug.dangers) this.zone(z, point(z));
    for (let i = 0; i < debug.candidates.length; i++) {
      const candidate = debug.candidates[i],
        selected = i === debug.selected;
      if (candidate.path.length < 2) continue;
      c.beginPath();
      candidate.path.forEach((p, index) => {
        const v = point(p);
        if (index) c.lineTo(v.x, v.y);
        else c.moveTo(v.x, v.y);
      });
      c.strokeStyle = selected
        ? "#d4f28c"
        : candidate.dash
          ? "#e5bd6a44"
          : "#b3c9be3d";
      c.lineWidth = selected ? 3 : 1;
      c.setLineDash(candidate.dash ? [5, 4] : []);
      c.stroke();
      if (selected) {
        const end = point(candidate.path.at(-1)!);
        c.beginPath();
        c.arc(end.x, end.y, 5, 0, Math.PI * 2);
        c.fillStyle = "#d4f28c";
        c.fill();
      }
    }
    c.setLineDash([]);
    const origin = point(debug.origin),
      selected = debug.candidates[debug.selected];
    if (selected) {
      const d = selected.direction,
        tip = { x: origin.x + d.x * 65, y: origin.y + d.y * 65 };
      c.beginPath();
      c.moveTo(origin.x, origin.y);
      c.lineTo(tip.x, tip.y);
      c.strokeStyle = "#e9ffc5";
      c.lineWidth = 3;
      c.stroke();
      const a = Math.atan2(d.y, d.x);
      c.beginPath();
      c.moveTo(tip.x, tip.y);
      c.lineTo(tip.x - Math.cos(a - 0.5) * 12, tip.y - Math.sin(a - 0.5) * 12);
      c.lineTo(tip.x - Math.cos(a + 0.5) * 12, tip.y - Math.sin(a + 0.5) * 12);
      c.closePath();
      c.fillStyle = "#e9ffc5";
      c.fill();
    }
    const goal = point(debug.goal);
    c.strokeStyle = "#f7d28d";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(goal.x, goal.y, 10, 0, Math.PI * 2);
    c.moveTo(goal.x - 16, goal.y);
    c.lineTo(goal.x + 16, goal.y);
    c.moveTo(goal.x, goal.y - 16);
    c.lineTo(goal.x, goal.y + 16);
    c.stroke();
    c.font = "11px system-ui";
    c.fillStyle = "#e7f0d5";
    c.fillText(
      `决策快照 ${debug.time.toFixed(2)}s · ${debug.algorithm === "legacy" ? "Legacy方向（无路线搜索）" : `${debug.candidates.length}条真实候选，代价越低越优`}`,
      Math.max(12, width / 2 - 170),
      height - 185,
    );
  }
  private zone(z: Zone, p: Vec) {
    const c = this.context;
    c.save();
    c.translate(p.x, p.y);
    c.strokeStyle = "#ffb4b680";
    c.fillStyle = "#ff93a00a";
    c.lineWidth = 1;
    c.setLineDash([4, 4]);
    c.beginPath();
    if (z.shape?.kind === "bar") {
      c.rotate(z.shape.angle);
      c.rect(-z.shape.length / 2, -z.r, z.shape.length, z.r * 2);
    } else if (z.shape?.kind === "fan") {
      c.moveTo(0, 0);
      c.arc(
        0,
        0,
        z.r,
        z.shape.angle - z.shape.halfAngle,
        z.shape.angle + z.shape.halfAngle,
      );
      c.closePath();
    } else c.arc(0, 0, z.r, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.restore();
  }
}
