import { Session } from '../session';
import { bounded } from '../../utils/numbers';
import type { GasPacket, GasRequest } from './protocol';

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<GasRequest>) => void;
  postMessage: (value: GasPacket, transfer: Transferable[]) => void;
};
let session: Session;

scope.onmessage = ({ data }) => {
  const start = performance.now();
  if (data.action === 'init' && data.config) session = new Session('diffusion', data.config);
  if (!session) throw new Error('Gas worker requires initialization');
  if (data.action === 'update' && data.patch) session.updateConfig(data.patch);
  if (data.action === 'advance' || data.action === 'step') {
    const count = bounded(data.ticks ?? 1, 1, 4, 1, true);
    for (let i = 0; i < count && !session.diffusion!.fault; i++) session.tick();
    if (data.action === 'step' || session.diffusion!.fault) session.record();
  }
  const particles = session.diffusion!.particles;
  const buffer =
    data.buffer?.length === particles.length * 6
      ? data.buffer
      : new Float64Array(particles.length * 6);
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i],
      k = i * 6;
    buffer[k] = p.x;
    buffer[k + 1] = p.y;
    buffer[k + 2] = p.vx;
    buffer[k + 3] = p.vy;
    buffer[k + 4] = p.r;
    buffer[k + 5] = p.m;
  }
  const snapshot = session.snapshot();
  snapshot.computeMs = performance.now() - start;
  scope.postMessage({ id: data.id, action: data.action, buffer, snapshot }, [buffer.buffer]);
};
