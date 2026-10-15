import { useId } from 'react';

interface Series {
  label: string;
  values: number[];
  color: string;
  dashed?: boolean;
}
const number = (n: number) =>
  Math.abs(n) >= 10000 ? `${(n / 1000).toFixed(0)}k` : Number(n.toFixed(2)).toString();

export function LineChart({
  title,
  subtitle,
  x,
  series,
  xLabel,
  yLabel,
  domain,
}: {
  title: string;
  subtitle?: string;
  x: number[];
  series: Series[];
  xLabel: string;
  yLabel: string;
  domain?: [number, number];
}) {
  const id = useId();
  const values = series.flatMap((s) => s.values);
  const minY = domain?.[0] ?? Math.min(0, ...values);
  const maxY = domain?.[1] ?? Math.max(1, ...values) * 1.1;
  const minX = x[0] ?? 0,
    maxX = Math.max(minX + 1, x.at(-1) ?? 1);
  const px = (v: number) => 52 + ((v - minX) / (maxX - minX)) * 468;
  const py = (v: number) => 155 - ((v - minY) / (maxY - minY)) * 120;
  return (
    <section className="chart-card panel" aria-label={title}>
      <div className="chart-heading">
        <div>
          <h3>{title}</h3>
          <span>{subtitle ?? '最近 360 个采样点'}</span>
        </div>
        <span className="tiny-label">LIVE DATA</span>
      </div>
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg className="chart" viewBox="0 0 540 194" role="img" aria-labelledby={id}>
        <title id={id}>
          {title}；横轴：{xLabel}；纵轴：{yLabel}
          {series.map((s) => `；${s.label}当前值 ${number(s.values.at(-1) ?? 0)}`).join('')}
        </title>
        <text x="12" y="15" className="axis-title">
          {yLabel}
        </text>
        {[0, 1, 2, 3].map((i) => {
          const v = minY + ((maxY - minY) * i) / 3;
          return (
            <g key={i}>
              <line x1="52" x2="520" y1={py(v)} y2={py(v)} className="grid-line" />
              <text x="44" y={py(v) + 4} textAnchor="end">
                {number(v)}
              </text>
            </g>
          );
        })}
        {[minX, (minX + maxX) / 2, maxX].map((v, i) => (
          <text key={i} x={px(v)} y="174" textAnchor="middle">
            {number(v)}
          </text>
        ))}
        {series.map((s) => (
          <polyline
            key={s.label}
            points={s.values.map((v, i) => `${px(x[i])},${py(v)}`).join(' ')}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeDasharray={s.dashed ? '5 4' : undefined}
          />
        ))}
        {series.map(
          (s) =>
            s.values.length > 0 && (
              <circle
                key={s.label}
                cx={px(x.at(-1)!)}
                cy={py(s.values.at(-1)!)}
                r="3"
                fill={s.color}
              />
            ),
        )}
        <text x="286" y="191" textAnchor="middle" className="axis-title">
          {xLabel}
        </text>
      </svg>
    </section>
  );
}

export function Histogram({
  title,
  values,
  xLabel,
  endLabel,
  expected,
}: {
  title: string;
  values: number[];
  xLabel: string;
  endLabel: string;
  expected?: number;
}) {
  const id = useId();
  const max = Math.max(1, ...values, expected ?? 0) * 1.15;
  const slot = 468 / values.length;
  return (
    <section className="chart-card panel" aria-label={title}>
      <div className="chart-heading">
        <div>
          <h3>{title}</h3>
          <span>当前快照 · {values.length} 个区间</span>
        </div>
        <span className="tiny-label">DISTRIBUTION</span>
      </div>
      <div className="chart-legend">
        <span>
          <i style={{ background: 'var(--accent)' }} />
          粒子 / 细胞数量
        </span>
        {expected !== undefined && (
          <span>
            <i style={{ background: 'var(--purple)' }} />
            均匀分布参考
          </span>
        )}
      </div>
      <svg className="chart" viewBox="0 0 540 194" role="img" aria-labelledby={id}>
        <title id={id}>
          {title}；横轴：{xLabel}；纵轴：数量；各区间：{values.join(', ')}
        </title>
        <text x="12" y="15" className="axis-title">
          数量 / 个
        </text>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line x1="52" x2="520" y1={155 - i * 40} y2={155 - i * 40} className="grid-line" />
            <text x="44" y={159 - i * 40} textAnchor="end">
              {number((max * i) / 3)}
            </text>
          </g>
        ))}
        {values.map((v, i) => (
          <rect
            key={i}
            x={52 + i * slot + 3}
            y={155 - (v / max) * 120}
            width={Math.max(1, slot - 6)}
            height={(v / max) * 120}
            rx="2"
            fill={i < values.length / 2 ? 'var(--accent)' : 'var(--purple)'}
            opacity="0.75"
          >
            <title>
              区间 {i + 1}：{v} 个
            </title>
          </rect>
        ))}
        {expected !== undefined && (
          <line
            x1="52"
            x2="520"
            y1={155 - (expected / max) * 120}
            y2={155 - (expected / max) * 120}
            stroke="var(--purple)"
            strokeDasharray="5 4"
          />
        )}
        <text x="52" y="174">
          0
        </text>
        <text x="520" y="174" textAnchor="end">
          {endLabel}
        </text>
        <text x="286" y="191" textAnchor="middle" className="axis-title">
          {xLabel}
        </text>
      </svg>
    </section>
  );
}
