import { MAX_ACTIVE_MS } from './core/config';
import { ExperimentTask } from './core/simulation';
import type { Algorithm, Config, Experiment, Round, RunResult } from './core/types';

export type Command =
  | { type: 'start'; config: Config; algorithms: Algorithm[]; seeds: number; demo: boolean; paused: boolean }
  | { type: 'pause' | 'resume' | 'step' | 'cancel' };
export type Reply =
  | { type: 'progress'; steps: number; budget: number; run?: RunResult; events: Round[] }
  | { type: 'done'; experiment: Experiment }
  | { type: 'paused' | 'cancelled' }
  | { type: 'error'; message: string };

let task: ExperimentTask | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let paused = true;
let demo = false;
let computeMs = 0;
const send = (message: Reply) => postMessage(message);
function stop() { clearTimeout(timer); timer = undefined; }
function pump(single = false) {
  if (!task || task.done || (paused && !single)) return;
  const start = performance.now();
  const events = task.tick(single ? 1 : demo ? 8 : 512);
  computeMs += performance.now() - start;
  if (computeMs > MAX_ACTIVE_MS) throw new Error('达到 30 秒计算预算，请缩小实验');
  send({ type: 'progress', steps: task.steps, budget: task.budget, run: task.snapshot(), events: events.slice(-12) });
  if (task.done) { stop(); send({ type: 'done', experiment: task.finish() }); task = undefined; }
  else if (!paused) timer = setTimeout(() => safely(() => pump()), demo ? 60 : 0);
}
function safely(operation: () => void) {
  try { operation(); }
  catch (error) { stop(); paused = true; task = undefined; send({ type: 'error', message: error instanceof Error ? error.message : '未知模拟错误' }); }
}
onmessage = (event: MessageEvent<Command>) => safely(() => {
  const command = event.data;
  if (command.type === 'start') {
    stop();
    task = new ExperimentTask(command.config, command.algorithms, command.seeds);
    demo = command.demo;
    computeMs = 0;
    paused = command.paused;
    if (!paused) pump();
  } else if (command.type === 'pause') { if (task) { paused = true; stop(); send({ type: 'paused' }); } }
  else if (command.type === 'resume') { if (!task) throw new Error('请先创建实验'); paused = false; stop(); pump(); }
  else if (command.type === 'step') { if (!demo || !paused) throw new Error('单步仅适用于暂停的演示'); pump(true); }
  else { stop(); paused = true; task?.cancel(); task = undefined; send({ type: 'cancelled' }); }
});
