import type { Candidate, SearchResult } from "../core/types";
import { labels } from "../core/types";
const palette = [
  "#38b9ae",
  "#e9ad54",
  "#9f8cfa",
  "#e87891",
  "#5ca8ee",
  "#a2c66a",
  "#dc8bdd",
  "#df8662",
];
export function InputView({
  candidate,
  path = [],
}: {
  candidate: Candidate | null;
  path?: number[];
}) {
  if (!candidate)
    return (
      <div className="empty">开始实验后，这里将展示真实评价的最佳输入。</div>
    );
  if (candidate.kind === "sort") {
    const max = Math.max(1, ...candidate.values.map(Math.abs));
    return (
      <div className="array" aria-label="最佳数组可视化">
        {candidate.values.length ? (
          candidate.values.map((v, i) => (
            <div className="bar-column" key={i}>
              <div
                className={`bar ${v < 0 ? "negative" : ""}`}
                style={{
                  height: `${Math.max(3, (Math.abs(v) / max) * 135)}px`,
                }}
              />
              <span>{v}</span>
            </div>
          ))
        ) : (
          <span>空数组 []</span>
        )}
      </div>
    );
  }
  const positions = Array.from({ length: candidate.nodes }, (_, i) => ({
    x: 230 + 175 * Math.cos((i * 2 * Math.PI) / candidate.nodes - Math.PI / 2),
    y: 180 + 140 * Math.sin((i * 2 * Math.PI) / candidate.nodes - Math.PI / 2),
  }));
  return (
    <svg
      className="graph"
      viewBox="0 0 460 360"
      role="img"
      aria-label="最佳有向图，起点0，终点为最后一个节点"
    >
      <defs>
        <marker
          id="arrow"
          markerWidth="7"
          markerHeight="7"
          refX="18"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L6,3 z" fill="currentColor" />
        </marker>
      </defs>
      {candidate.edges.map((e) => {
        const a = positions[e.from],
          b = positions[e.to],
          highlight = path.some((v, i) => v === e.from && path[i + 1] === e.to);
        const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.07,
          my = (a.y + b.y) / 2 - (b.x - a.x) * 0.07;
        return (
          <g
            key={`${e.from}:${e.to}`}
            className={highlight ? "path-edge" : "edge"}
          >
            <path
              d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`}
              markerEnd="url(#arrow)"
            />
            <text x={mx} y={my}>
              {e.weight}
            </text>
          </g>
        );
      })}
      {positions.map((p, i) => (
        <g key={i}>
          <circle
            cx={p.x}
            cy={p.y}
            r="14"
            className={
              i === 0 || i === candidate.nodes - 1 ? "endpoint" : "node"
            }
          />
          <text x={p.x} y={p.y + 4} textAnchor="middle" className="node-label">
            {i}
          </text>
        </g>
      ))}
    </svg>
  );
}
export function Curve({ records }: { records: SearchResult[] }) {
  const maxX = Math.max(1, ...records.map((r) => r.config.budget)),
    maxY = Math.max(1, ...records.flatMap((r) => r.bestCost ?? 0));
  return (
    <>
      <svg
        viewBox="0 0 640 235"
        className="curve"
        role="img"
        aria-label="最佳成本变化曲线，横轴评价次数，纵轴最佳成本"
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1="52"
              y1={195 - 165 * t}
              x2="620"
              y2={195 - 165 * t}
              className="grid-line"
            />
            <text x="4" y={199 - 165 * t}>
              {Math.round(maxY * t)}
            </text>
          </g>
        ))}
        <text x="52" y="221">
          0
        </text>
        <text x="550" y="221">
          {maxX} 次评价
        </text>
        {records.map((r, i) => {
          const stride = Math.max(1, Math.ceil(r.history.length / 600));
          const points = r.history.filter(
            (_, j) => j % stride === 0 || j === r.history.length - 1,
          );
          return (
            <polyline
              key={i}
              fill="none"
              stroke={palette[i % palette.length]}
              strokeWidth="2"
              points={points
                .map(
                  (p) =>
                    `${52 + (568 * p.evaluation) / maxX},${195 - (165 * p.cost) / maxY}`,
                )
                .join(" ")}
            />
          );
        })}
      </svg>
      <div className="legend">
        {records.map((r, i) => (
          <span key={i}>
            <i style={{ background: palette[i % palette.length] }} />
            {labels[r.config.strategy]} · {r.config.seed}
          </span>
        ))}
      </div>
    </>
  );
}
