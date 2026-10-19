import type { Result } from "./core/types";
export function Graph({ graph }: { graph: Result["graph"] }) {
  const columns = 10,
    point = (id: number) => ({
      x: 40 + (id % columns) * 80,
      y: 40 + Math.floor(id / columns) * 72,
    });
  return (
    <div className="graph-scroll">
      <svg
        aria-label="可达状态图"
        role="img"
        viewBox={`0 0 800 ${Math.max(100, Math.ceil(graph.nodes.length / columns) * 72 + 20)}`}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="17"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        {graph.edges.map((edge, i) => {
          const a = point(edge.from),
            b = point(edge.to);
          return (
            <path
              key={i}
              className="edge"
              markerEnd="url(#arrow)"
              d={
                edge.from === edge.to
                  ? `M${a.x - 8},${a.y - 12} C${a.x - 40},${a.y - 60} ${a.x + 40},${a.y - 60} ${a.x + 8},${a.y - 12}`
                  : `M${a.x},${a.y} Q${(a.x + b.x) / 2},${(a.y + b.y) / 2 - 15} ${b.x},${b.y}`
              }
            >
              <title>
                {edge.from} → {edge.to}：{edge.action}
              </title>
            </path>
          );
        })}
        {graph.nodes.map((node) => {
          const p = point(node.id);
          return (
            <g key={node.id}>
              <title>{`状态 ${node.id}：${JSON.stringify(node.state)}`}</title>
              <circle cx={p.x} cy={p.y} r="16" />
              <text x={p.x} y={p.y + 4} textAnchor="middle">
                {node.id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
