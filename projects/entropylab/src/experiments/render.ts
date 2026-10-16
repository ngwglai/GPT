import type { Session } from './session';

export function drawSimulation(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  session: Session,
  light: boolean,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = light ? '#f5f8fc' : '#0e141e';
  ctx.fillRect(0, 0, width, height);
  const size = Math.min(width - 36, height - 36);
  const left = (width - size) / 2,
    top = (height - size) / 2;
  ctx.strokeStyle = light ? '#e0e7ef' : '#1d2837';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const d = (i / 10) * size;
    ctx.beginPath();
    ctx.moveTo(left + d, top);
    ctx.lineTo(left + d, top + size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(left, top + d);
    ctx.lineTo(left + size, top + d);
    ctx.stroke();
  }
  if (session.diffusion) {
    const colorScale = Math.max(
      0.01,
      3 * Math.sqrt((2 * session.diffusion.initialEnergy) / session.diffusion.particles.length),
    );
    ctx.strokeStyle = light ? '#a0b3c9' : '#46556c';
    ctx.strokeRect(left, top, size, size);
    for (const p of session.diffusion.particles) {
      ctx.fillStyle =
        session.config.gasDisplay === 'speed'
          ? `hsl(${220 - 210 * Math.min(1, Math.hypot(p.vx, p.vy) / colorScale)} 72% ${light ? 42 : 67}%)`
          : light
            ? '#148565'
            : '#8ce5bd';
      ctx.beginPath();
      ctx.arc(left + p.x * size, top + p.y * size, p.r * size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.setLineDash(session.diffusion.divider ? [] : [5, 6]);
    ctx.lineWidth = session.diffusion.divider ? 1.5 : 1;
    ctx.strokeStyle = session.diffusion.divider
      ? light
        ? '#6c7a8f'
        : '#8796ab'
      : light
        ? '#b3c0d1'
        : '#34445a';
    ctx.beginPath();
    ctx.moveTo(width / 2, top);
    ctx.lineTo(width / 2, top + size);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (session.walk) {
    const { particles, steps, stepLength } = session.walk;
    const extent = Math.max(
      12,
      Math.sqrt(steps) * stepLength * 3,
      ...particles.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)) * 1.1),
    );
    const scale = size / (2 * extent),
      cx = width / 2,
      cy = height / 2;
    ctx.strokeStyle = light ? '#9babc0' : '#3a4c64';
    ctx.beginPath();
    ctx.moveTo(left, cy);
    ctx.lineTo(left + size, cy);
    ctx.moveTo(cx, top);
    ctx.lineTo(cx, top + size);
    ctx.stroke();
    const expectedRadius = Math.sqrt(steps) * stepLength * scale;
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = light ? '#9771c0' : '#7e649f';
    ctx.beginPath();
    ctx.arc(cx, cy, expectedRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    particles.forEach((p, index) => {
      const hue = 145 + (index / particles.length) * 125;
      const color = `hsl(${hue} 65% ${light ? 37 : 72}%)`;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      p.trail.slice(-session.config.trailLength).forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(cx + x * scale, cy - y * scale);
        else ctx.lineTo(cx + x * scale, cy - y * scale);
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx + p.x * scale, cy - p.y * scale, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = light ? '#546579' : '#8c9bb0';
    ctx.font = '11px monospace';
    ctx.fillText(`±${extent.toFixed(1)} u`, left + 5, top + size - 8);
    ctx.fillText('0', cx + 5, cy + 13);
  }
  const lattice = session.life ?? session.ising;
  if (lattice) {
    const cell = size / lattice.size;
    const data = session.life ? session.life.cells : session.ising!.spins;
    for (let y = 0; y < lattice.size; y++)
      for (let x = 0; x < lattice.size; x++) {
        const v = data[y * lattice.size + x];
        ctx.fillStyle = session.life
          ? v
            ? light
              ? '#1a9471'
              : '#9ce9c6'
            : light
              ? '#e5ecf3'
              : '#182330'
          : v > 0
            ? light
              ? '#158866'
              : '#8ee3b9'
            : light
              ? '#9b7dcd'
              : '#7b63a9';
        ctx.fillRect(
          left + x * cell,
          top + y * cell,
          cell - (session.life ? 0.6 : 0),
          cell - (session.life ? 0.6 : 0),
        );
      }
  }
  ctx.globalAlpha = 1;
}

export function canvasCell(
  width: number,
  height: number,
  x: number,
  y: number,
  grid: number,
): [number, number] {
  const size = Math.min(width - 36, height - 36);
  return [
    Math.floor(((x - (width - size) / 2) / size) * grid),
    Math.floor(((y - (height - size) / 2) / size) * grid),
  ];
}
