import type { Metrics, TraceEntry } from './types';
export function metrics(trace: TraceEntry[]): Metrics {
  const compute = trace.filter(t => t.op !== 'input');
  const executed = compute.filter(t => !t.cached).length;
  return {
    total: compute.length, executed, skipped: compute.length - executed,
    changed: compute.filter(t => t.changed).length,
    unaffected: compute.filter(t => t.reason === 'unaffected').length,
    blocked: compute.filter(t => t.reason === 'blocked').length,
    unchangedExecuted: compute.filter(t => !t.cached && !t.changed).length,
    savings: compute.length ? 1 - executed / compute.length : 0,
    theoreticalCost: executed, fullCost: compute.length,
  };
}
