import { useCallback, useEffect, useRef, useState } from 'react';
import { Session, defaults, type Config, type ExperimentId } from '../experiments/session';
import { drawSimulation } from '../experiments/render';
import { SimulationClock } from '../utils/clock';

export function useSimulation(id: ExperimentId, light: boolean) {
  const [session, setSession] = useState(() => new Session(id));
  const [clock] = useState(() => new SimulationClock());
  const [running, setRunning] = useState(false);
  const [config, setConfig] = useState(session.config);
  const [snapshot, setSnapshot] = useState(() => session.snapshot());
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const pause = useCallback(() => {
    clock.pause();
    setRunning(false);
  }, [clock]);
  const restart = useCallback(
    (next: Config) => {
      clock.reset();
      setRunning(false);
      const replacement = new Session(id, next);
      setSession(replacement);
      setConfig(replacement.config);
      setSnapshot(replacement.snapshot());
    },
    [id, clock],
  );

  function update(patch: Partial<Config>) {
    const needsReset = session.updateConfig(patch);
    if (needsReset) restart(session.config);
    else {
      setConfig({ ...session.config });
      clock.resync();
    }
  }

  function toggle() {
    if (clock.running) pause();
    else {
      clock.play();
      setRunning(true);
    }
  }

  function step(count = 1) {
    for (let i = 0; i < count; i++) clock.singleStep(() => session.tick());
    session.record();
    setSnapshot(session.snapshot());
  }

  const refresh = () => {
    session.record();
    setSnapshot(session.snapshot());
  };

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
        clock.frame(time, rate * session.config.speed, () => session.tick());
        if (width > 36 && height > 36) drawSimulation(ctx, width, height, session, light);
        if (time - lastSnapshot >= 100) {
          setSnapshot(session.snapshot());
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
