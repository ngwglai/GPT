import type { Experiment, Phase } from './types';

export function exportJSON(experiment: Experiment): string { return JSON.stringify(experiment, null, 2); }

export function exportCSV(experiment: Experiment): string {
  const header = ['schemaVersion', 'game', 'algorithm', 'phase', 'seed', 'n', 'mean', 'total', 'sd_round', 'wins', 'draws', 'losses', 'winRate', 'actions', 'policy', 'config'];
  const rows: unknown[][] = [header];
  for (const run of experiment.runs) for (const phase of ['train', 'test', 'transfer'] as Phase[]) {
    const m = run.phases[phase]?.metrics;
    if (m) rows.push([1, experiment.config.game, run.algorithm, phase, run.seed, m.n, m.mean, m.total, m.sd,
      m.wins, m.draws, m.losses, m.winRate, JSON.stringify(m.actions), JSON.stringify(run.policy), JSON.stringify(experiment.config)]);
  }
  return '\ufeff' + rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
}
