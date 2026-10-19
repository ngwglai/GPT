import { emptySnapshot } from './core/engine';
import type { Result, Snapshot, Status } from './core/engine';
import type { Config } from './core/config';
export interface WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(value: unknown): void;
  terminate(): void;
}
export class WorkerClient {
  private worker?: WorkerLike;
  private timer?: ReturnType<typeof setTimeout>;
  private snapshot = emptySnapshot();
  private active = true;
  constructor(config: Config, private progress: (snapshot: Snapshot) => void, private done: (result: Result) => void,
    factory: () => WorkerLike = () => new Worker(new URL('./synth.worker.ts', import.meta.url), { type: 'module' })) {
    try {
      this.worker = factory();
      this.worker.onmessage = event => {
        if (!this.active) return;
        if (event.data?.kind === 'progress') { this.snapshot = event.data.snapshot; this.progress(this.snapshot); }
        else if (event.data?.kind === 'result') this.finish(event.data.result);
        else this.fail('worker-error', 'Worker 消息协议错误；没有验证结论');
      };
      this.worker.onerror = () => this.fail('worker-error', 'Worker 崩溃或加载失败；没有验证结论');
      this.worker.onmessageerror = () => this.fail('worker-error', 'Worker 消息读取失败；没有验证结论');
      this.timer = setTimeout(() => this.fail('worker-error', 'Worker 未响应；没有验证结论'), config.budget.timeMs + 5000);
      this.worker.postMessage(config);
    } catch { this.fail('worker-error', 'Worker 启动失败；没有验证结论'); }
  }
  private finish(result: Result) {
    if (!this.active) return;
    this.dispose(); this.done(result);
  }
  private fail(status: Status, message: string) { this.finish({ ...this.snapshot, status, message }); }
  cancel() { this.fail('cancelled', '已取消计算；验证未完成'); }
  dispose() {
    this.active = false; clearTimeout(this.timer); this.worker?.terminate();
  }
}
