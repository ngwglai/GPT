import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../src/core/config';
import type { Command, Reply } from '../src/worker';

let messages: Reply[];
const dispatch = (command: Command) => (globalThis.onmessage as unknown as (e: { data: Command }) => void)({ data: command });
const start = (patch: Partial<Extract<Command, { type: 'start' }>> = {}): Command => ({
  type: 'start', config: { ...structuredClone(DEFAULT_CONFIG), trainRounds: 10, testRounds: 5 }, algorithms: ['epsilon'], seeds: 1, demo: true, paused: true, ...patch,
});
beforeEach(async () => {
  vi.useFakeTimers(); vi.resetModules(); messages = [];
  vi.stubGlobal('postMessage', (reply: Reply) => messages.push(structuredClone(reply)));
  vi.stubGlobal('onmessage', null);
  await import('../src/worker');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('Worker supports start paused, step, resume, pause and exact completion', () => {
  dispatch(start()); expect(messages).toHaveLength(0);
  dispatch({ type: 'step' }); expect(messages.at(-1)).toMatchObject({ type: 'progress', steps: 1 });
  dispatch({ type: 'resume' }); dispatch({ type: 'pause' });
  const count = messages.length; vi.runAllTimers(); expect(messages).toHaveLength(count);
  expect(messages.at(-1)?.type).toBe('paused');
  dispatch({ type: 'resume' }); vi.runAllTimers();
  expect(messages.at(-1)).toMatchObject({ type: 'done', experiment: { runs: [{ phases: { train: { metrics: { n: 10 } }, test: { metrics: { n: 5 } } } }] } });
  const doneCount = messages.length; dispatch({ type: 'pause' }); expect(messages).toHaveLength(doneCount);
});
it('Worker cancellation stops timers and prevents full result export', () => {
  dispatch(start({ paused: false })); dispatch({ type: 'cancel' }); vi.runAllTimers();
  expect(messages.at(-1)?.type).toBe('cancelled'); expect(messages.some(m => m.type === 'done')).toBe(false);
});
it('Worker rejects malformed configuration without leaving pending timers', () => {
  dispatch(start({ config: { ...DEFAULT_CONFIG, gamma: 0 }, paused: false }));
  expect(messages.at(-1)?.type).toBe('error'); expect(vi.getTimerCount()).toBe(0);
});
it('Worker disallows single step in batch mode', () => {
  dispatch(start({ demo: false })); dispatch({ type: 'step' });
  expect(messages.at(-1)).toMatchObject({ type: 'error', message: '单步仅适用于暂停的演示' });
});
it('Worker enforces compute time budget and clears work on failure', () => {
  vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(31000);
  dispatch(start()); dispatch({ type: 'step' });
  expect(messages.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('预算') });
  expect(vi.getTimerCount()).toBe(0);
});
it('Worker returns the same paired-seed batch contract as incremental simulation', () => {
  dispatch(start({ demo: false, paused: false, algorithms: ['random', 'ucb'], seeds: 3 })); vi.runAllTimers();
  expect(messages.at(-1)).toMatchObject({ type: 'done', experiment: { seedValues: [42, 43, 44], algorithms: ['random', 'ucb'] } });
});
