import { afterEach, expect, test, vi } from 'vitest';
import { WorkerClient } from '../src/worker-client';
import type { WorkerLike } from '../src/worker-client';
import { emptySnapshot } from '../src/core/engine';
import { preset } from '../src/core/cases';
class Fake implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  onmessageerror: WorkerLike['onmessageerror'] = null;
  postMessage = vi.fn(); terminate = vi.fn();
}
afterEach(() => vi.useRealTimers());
test('progress, result and termination; stale messages ignored', () => {
  const worker = new Fake(), progress = vi.fn(), done = vi.fn();
  new WorkerClient(preset('Abs'), progress, done, () => worker);
  expect(worker.postMessage).toHaveBeenCalledWith(preset('Abs'));
  const snapshot = emptySnapshot(); worker.onmessage!({ data: { kind: 'progress', snapshot } } as MessageEvent);
  expect(progress).toHaveBeenCalledWith(snapshot);
  const result = { ...snapshot, status: 'verified', message: 'finite' };
  worker.onmessage!({ data: { kind: 'result', result } } as MessageEvent);
  worker.onmessage!({ data: { kind: 'result', result } } as MessageEvent);
  expect(done).toHaveBeenCalledExactlyOnceWith(result); expect(worker.terminate).toHaveBeenCalledOnce();
});
test('cancel terminates immediately and differs from crash', () => {
  const worker = new Fake(), done = vi.fn(); const c = new WorkerClient(preset('Abs'), vi.fn(), done, () => worker);
  c.cancel(); worker.onerror!({} as ErrorEvent);
  expect(done).toHaveBeenCalledOnce(); expect(done.mock.calls[0][0].status).toBe('cancelled'); expect(worker.terminate).toHaveBeenCalledOnce();
});
for (const kind of ['error', 'messageerror', 'invalid-protocol'] as const) test(`Worker ${kind} has explicit fault status`, () => {
  const worker = new Fake(), done = vi.fn(); new WorkerClient(preset('Abs'), vi.fn(), done, () => worker);
  if (kind === 'error') worker.onerror!({} as ErrorEvent);
  else if (kind === 'messageerror') worker.onmessageerror!({} as MessageEvent);
  else worker.onmessage!({ data: {} } as MessageEvent);
  expect(done.mock.calls[0][0].status).toBe('worker-error'); expect(worker.terminate).toHaveBeenCalledOnce();
});
test('constructor failure and postMessage exceptions are explicit faults', () => {
  const done = vi.fn(); new WorkerClient(preset('Abs'), vi.fn(), done, () => { throw Error('load'); });
  expect(done.mock.calls[0][0].status).toBe('worker-error');
  const worker = new Fake(); worker.postMessage.mockImplementation(() => { throw Error('serialization'); });
  const another = vi.fn(); new WorkerClient(preset('Abs'), vi.fn(), another, () => worker);
  expect(another.mock.calls[0][0].status).toBe('worker-error');
});
test('watchdog detects unresponsive worker and disposal suppresses callbacks', () => {
  vi.useFakeTimers(); const done = vi.fn(), worker = new Fake(); new WorkerClient(preset('Abs'), vi.fn(), done, () => worker);
  vi.advanceTimersByTime(20001); expect(done.mock.calls[0][0].status).toBe('worker-error');
  const other = vi.fn(), second = new Fake(); const c = new WorkerClient(preset('Abs'), vi.fn(), other, () => second);
  c.dispose(); vi.runAllTimers(); second.onerror!({} as ErrorEvent); expect(other).not.toHaveBeenCalled();
});
