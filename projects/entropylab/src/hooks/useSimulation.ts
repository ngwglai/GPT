import { useCallback, useEffect, useRef, useState } from 'react';
import { Session, defaults, type Config, type ExperimentId } from '../experiments/session';
import { drawSimulation } from '../experiments/render';
import { SimulationClock } from '../utils/clock';
import type { GasDriver, GasPacket } from '../experiments/diffusion/protocol';

export function useSimulation(id: ExperimentId, light: boolean) {
  const [session, setSession] = useState(() => new Session(id));
  const [clock] = useState(() => new SimulationClock());
  const [running, setRunning] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [config, setConfig] = useState(session.config);
  const [snapshot, setSnapshot] = useState(() => session.snapshot());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const driver = useRef<GasDriver | null>(null);
  const workerSnapshot = useRef<ReturnType<Session['snapshot']> | null>(null);

  const pause = useCallback(() => {
    clock.pause();
    if (driver.current) {
      setPausing(true);
      driver.current.post({ action: 'pause' });
    } else setRunning(false);
  }, [clock]);
  const restart = useCallback(
    (next: Config) => {
      clock.reset();
      setRunning(false);
      setPausing(false);
      const replacement = new Session(id, next);
      setSession(replacement);
      setConfig(replacement.config);
      setSnapshot(replacement.snapshot());
    },
    [id, clock],
  );

  function update(patch: Partial<Config>) {
    // Divider insertion is solved in the worker, never on the UI copy.
    const useWorker = driver.current !== null;
    const needsReset = session.updateConfig(patch, !useWorker);
    if (needsReset) restart(session.config);
    else {
      setConfig({ ...session.config });
      driver.current?.post({ action: 'update', patch });
      clock.resync();
    }
  }

  function toggle() {
    if (pausing) return;
    if (clock.running) pause();
    else {
      clock.play();
      setRunning(true);
    }
  }

  function step(count = 1) {
    if (driver.current) {
      if (!clock.running) driver.current.post({ action: 'step', ticks: count });
      return;
    }
    for (let i = 0; i < count; i++) clock.singleStep(() => session.tick());
    session.record();
    setSnapshot(session.snapshot());
  }

  const refresh = () => {
    session.record();
    setSnapshot(session.snapshot());
  };

  useEffect(() => {
    workerSnapshot.current = null;
    if (id !== 'diffusion' || typeof Worker === 'undefined') return;
    const worker = new Worker(new URL('../experiments/diffusion/worker.ts', import.meta.url), {
      type: 'module',
    });
    let active = true,
      sequence = 0;
    let returnedBuffer: Float64Array | undefined;
    const connection: GasDriver = {
      pending: 0,
      post(request) {
        connection.pending++;
        const buffer = returnedBuffer;
        returnedBuffer = undefined;
        worker.postMessage({ ...request, id: ++sequence, buffer }, buffer ? [buffer.buffer] : []);
      },
    };
    driver.current = connection;
    worker.onmessage = ({ data }: MessageEvent<GasPacket>) => {
      if (!active) return;
      connection.pending = Math.max(0, connection.pending - 1);
      returnedBuffer = data.buffer;
      const gas = session.diffusion!;
      for (let i = 0; i < gas.particles.length; i++) {
        const p = gas.particles[i],
          k = i * 6;
        p.x = data.buffer[k];
        p.y = data.buffer[k + 1];
        p.vx = data.buffer[k + 2];
        p.vy = data.buffer[k + 3];
      }
      gas.time = data.snapshot.x;
      gas.collisions = data.snapshot.gas!.collisions;
      gas.wallImpulseX = data.snapshot.gas!.wallImpulseX;
      gas.wallImpulseY = data.snapshot.gas!.wallImpulseY;
      gas.divider = data.snapshot.gas!.divider;
      gas.fault = data.snapshot.gas!.fault;
      workerSnapshot.current = data.snapshot;
      if (session.config.divider !== gas.divider) {
        session.config.divider = gas.divider;
        setConfig({ ...session.config });
      }
      if (data.action !== 'advance' || gas.fault) setSnapshot(data.snapshot);
      if (data.action === 'pause' || gas.fault) {
        clock.pause();
        setRunning(false);
        setPausing(false);
      }
    };
    worker.onerror = () => {
      if (!active) return;
      clock.pause();
      setRunning(false);
      setPausing(false);
      session.diffusion!.fault = '计算线程发生错误，请重置模拟。';
      const failed = session.snapshot();
      workerSnapshot.current = failed;
      setSnapshot(failed);
    };
    connection.post({ action: 'init', config: session.config });
    return () => {
      active = false;
      driver.current = null;
      workerSnapshot.current = null;
      worker.terminate();
    };
  }, [clock, id, session]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let width = 0,
      height = 0,
      lastSnapshot = -Infinity,
      frameId = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const onVisibility = () => {
      clock.resync();
    };
    document.addEventListener('visibilitychange', onVisibility);
    clock.resync();
    const frame = (time: number) => {
      if (!document.hidden) {
        const rate = session.id === 'diffusion' ? 60 : session.config.rate;
        const connection = driver.current;
        if (connection) {
          // At most one numerical batch in flight. Drop playback backlog, never enlarge dt.
          if (connection.pending > 0) clock.resync();
          else {
            let ticks = 0;
            clock.frame(time, rate * session.config.speed, () => {
              ticks++;
            });
            if (ticks > 0) connection.post({ action: 'advance', ticks: Math.min(4, ticks) });
          }
        } else {
          if (session.diffusion) {
            let ticks = 0;
            clock.frame(time, rate * session.config.speed, () => {
              ticks++;
            });
            if (ticks > 0) session.tick(); // Unsupported-Worker fallback never runs a long catch-up batch.
          } else clock.frame(time, rate * session.config.speed, () => session.tick());
          if (session.diffusion?.fault) {
            clock.pause();
            setRunning(false);
          }
        }
        if (width > 36 && height > 36) drawSimulation(ctx, width, height, session, light);
        if (time - lastSnapshot >= 100) {
          setSnapshot(workerSnapshot.current ?? session.snapshot());
          lastSnapshot = time;
        }
      }
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [clock, light, session]);

  useEffect(() => () => clock.pause(), [clock]);

  return {
    session,
    config,
    snapshot,
    running,
    pausing,
    canvasRef,
    toggle,
    pause,
    step,
    update,
    refresh,
    reset: () => restart(session.config),
    restore: () => restart(defaults[id]),
  };
}
