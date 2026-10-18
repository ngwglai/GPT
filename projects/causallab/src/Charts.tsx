import { descendants, topologicalOrder, type Model } from "./core/model";
import { histogram } from "./core/statistics";
export const format = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : Number.isFinite(value)
      ? value.toLocaleString("zh-CN", { maximumFractionDigits: 4 })
      : "不可计算";
export function Graph({ model }: { model: Model }) {
  let order = model.variables;
  try {
    order = topologicalOrder(model);
  } catch {
    /* Invalid drafts remain editable. */
  }
  const levels = new Map<string, number>();
  order.forEach((v) =>
    levels.set(
      v.id,
      Math.max(
        0,
        ...Object.keys(v.weights).map((id) => (levels.get(id) ?? -1) + 1),
      ),
    ),
  );
  const positions = new Map<string, { x: number; y: number }>(),
    counts = new Map<number, number>();
  order.forEach((v) => {
    const level = levels.get(v.id) ?? 0,
      index = counts.get(level) ?? 0;
    counts.set(level, index + 1);
    positions.set(v.id, { x: 85 + level * 190, y: 65 + index * 100 });
  });
  const width = Math.max(400, 120 + Math.max(0, ...levels.values()) * 190 + 85),
    height = Math.max(180, Math.max(0, ...counts.values()) * 100 + 20);
  return (
    <div className="graph">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="因果图，有向边与系数"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 Z" fill="#778da4" />
          </marker>
        </defs>
        {model.variables.flatMap((v) =>
          Object.entries(v.weights).map(([p, w]) => {
            const a = positions.get(p),
              b = positions.get(v.id);
            if (!a || !b) return null;
            const arc = a.y === b.y && b.x - a.x > 200;
            return (
              <g key={p + v.id}>
                <path
                  d={
                    arc
                      ? `M ${a.x + 49} ${a.y} C ${a.x + 90} ${a.y + 80}, ${b.x - 90} ${b.y + 80}, ${b.x - 53} ${b.y}`
                      : `M ${a.x + 49} ${a.y} L ${b.x - 53} ${b.y}`
                  }
                  fill="none"
                  stroke="#778da4"
                  strokeWidth="2"
                  markerEnd="url(#arrow)"
                />
                <text
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 + (arc ? 77 : -10)}
                  textAnchor="middle"
                  fill="#466077"
                  fontSize="13"
                >
                  {format(w)}
                </text>
              </g>
            );
          }),
        )}
        {model.variables.map((v) => {
          const pos = positions.get(v.id)!;
          return (
            <g key={v.id}>
              <rect
                x={pos.x - 49}
                y={pos.y - 24}
                width="98"
                height="48"
                rx="12"
                fill={v.kind === "bernoulli" ? "#e5f4f0" : "#e8eefb"}
                stroke={v.kind === "bernoulli" ? "#14836b" : "#4e66ae"}
              />
              <text
                x={pos.x}
                y={pos.y + 5}
                textAnchor="middle"
                fill="#173445"
                fontSize="17"
                fontWeight="600"
              >
                {v.id}
              </text>
              <title>
                {v.label} · {v.kind === "bernoulli" ? "二元" : "连续"}；父节点：
                {Object.keys(v.weights).join(", ") || "无"}；后代：
                {(() => {
                  try {
                    return descendants(model, v.id).join(", ") || "无";
                  } catch {
                    return "模型无效";
                  }
                })()}
              </title>
            </g>
          );
        })}
      </svg>
      <p className="caption">
        箭头表示结构依赖；边上标注系数。绿色：二元概率机制；蓝色：连续线性机制。
      </p>
    </div>
  );
}
export function Distribution({
  title,
  values,
}: {
  title: string;
  values: number[];
}) {
  const bins = histogram(values);
  const max = Math.max(1, ...bins.map((b) => b.count));
  return (
    <figure className="distribution">
      <figcaption>
        {title} <small>n={values.length}</small>
      </figcaption>
      <svg viewBox="0 0 340 120" role="img" aria-label={title + "直方图"}>
        {bins.map((b, i) => (
          <rect
            key={i}
            x={15 + (i * 310) / bins.length}
            y={85 - (b.count / max) * 70}
            width={Math.max(1, 310 / bins.length - 3)}
            height={(b.count / max) * 70}
            rx="2"
            fill="currentColor"
          >
            <title>
              [{format(b.start)}, {format(b.end)}
              {i === bins.length - 1 ? "]" : ")"}：{b.count} 个样本
            </title>
          </rect>
        ))}
        <line x1="15" x2="325" y1="86" y2="86" stroke="#b7c3cd" />
        <text x="15" y="108" fontSize="11" fill="#526676">
          {format(bins[0]?.start)}
        </text>
        <text x="325" y="108" fontSize="11" fill="#526676" textAnchor="end">
          {format(bins.at(-1)?.end)}
        </text>
      </svg>
      <p className="caption">
        横轴：变量值；纵轴：计数，各图独立缩放。悬停查看区间和计数。
      </p>
    </figure>
  );
}
