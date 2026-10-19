import { runExperiment } from './core/engine';
self.onmessage = async (event: MessageEvent<unknown>) => {
  const result = await runExperiment(event.data, { progress: snapshot => self.postMessage({ kind: 'progress', snapshot }) });
  self.postMessage({ kind: 'result', result });
};
