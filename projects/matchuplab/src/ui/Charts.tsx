import { ALGORITHM_NAMES, type CurvePoint, type Phase, type RunResult } from '../core/types';
import { GAMES } from '../core/games';
import type { GameId } from '../core/types';

export const PHASE_NAMES: Record<Phase, string> = { train: '训练', test: '独立测试', transfer: '迁移测试' };
const COLORS = ['#17646b', '#c85b32', '#6651a1', '#2e7954'];

export function LearningChart({ runs, phase, game, cumulative }: { runs: RunResult[]; phase: Phase; game: GameId; cumulative: boolean }) {
  const visible = runs.filter(r => r.phases[phase]).slice(0, 4);
  const curves = visible.map(r => r.phases[phase]!.curve);
  const xmax = Math.max(1, ...curves.flatMap(c => c.map(p => p.round)));
  const bound = GAMES[game].max * (cumulative ? xmax : 1);
  const y = (v: number) => 120 - v / bound * 92;
  const value = (p: CurvePoint) => cumulative ? p.total : p.mean;
  return <div className="chart-wrap">
    <svg viewBox="0 0 720 265" role="img" aria-label={`${PHASE_NAMES[phase]}${cumulative ? '累计收益' : '平均收益'}学习曲线`}>
      <title>首个种子的各算法曲线；横轴为阶段回合，纵轴为原始收益</title>
      {[-bound, 0, bound].map(t => <g key={t}><line x1="62" x2="700" y1={y(t)} y2={y(t)} className="gridline" /><text x="52" y={y(t) + 4} textAnchor="end">{t.toFixed(0)}</text></g>)}
      <text x="62" y="245">1</text><text x="700" y="245" textAnchor="end">{xmax} 回合</text>
      {curves.map((curve, i) => <polyline key={visible[i].algorithm} fill="none" stroke={COLORS[i]} strokeWidth="2.5" points={curve.map(p => `${62 + (p.round - 1) / Math.max(1, xmax - 1) * 638},${y(value(p))}`).join(' ')} />)}
    </svg>
    <div className="legend">{visible.map((r, i) => <span key={r.algorithm} style={{ color: COLORS[i] }}>● {ALGORITHM_NAMES[r.algorithm]} · seed {r.seed}</span>)}</div>
    {!visible.length && <p className="chart-empty">运行后显示曲线</p>}
  </div>;
}

export function Distribution({ run, phase, game }: { run?: RunResult; phase: Phase; game: GameId }) {
  const metrics = run?.phases[phase]?.metrics;
  return <div className="distribution" aria-label="动作分布">
    {GAMES[game].actions.map((name, i) => {
      const ratio = metrics?.n ? metrics.actions[i] / metrics.n : 0;
      return <div key={name}><span>{name}</span><div className="bar"><i style={{ width: `${ratio * 100}%` }} /></div><strong>{(ratio * 100).toFixed(1)}%</strong></div>;
    })}
    <p>{run ? `${ALGORITHM_NAMES[run.algorithm]} · seed ${run.seed}` : '所选运行'}的实际动作频率。冻结策略：{run?.policy.length ? run.policy.map(p => `${(p * 100).toFixed(1)}%`).join(' / ') : '训练结束后显示'}</p>
  </div>;
}
