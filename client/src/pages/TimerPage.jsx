import { useCallback, useEffect, useMemo, useState } from 'react';
import FlyerLayer from '../components/FlyerLayer.jsx';
import { useDebateState } from '../hooks/useDebateState.js';
import { useStageTransition } from '../hooks/useStageTransition.js';
import { useNow, useTicker } from '../hooks/useTicker.js';
import { formatClock, getTimeParts, pad2 } from '../lib/time.js';
import { EVENT } from '../config.js';
import '../styles/timer.css';

const clockFormat = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export default function TimerPage() {
  const { state, connected } = useDebateState();
  const isRunning = state?.status === 'running';
  const clockNow = useNow(1000);
  const [cursorIdle, setCursorIdle] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(
    () => Boolean(document.fullscreenElement),
  );
  const { displayed, phase } = useStageTransition(state?.view ?? 'timer');
  const tick = useTicker(isRunning && displayed === 'timer', 30);

  /* ------------------------------- tiempo -------------------------------- */
  const remaining = useMemo(() => {
    if (!state) return 0;
    if (state.status !== 'running') return state.remainingMs;
    return Math.max(0, state.remainingMs - (tick - state.receivedAt));
  }, [state, tick]);

  const warningMs = (state?.warningSeconds ?? 10) * 1000;

  const isPaused = state?.status === 'paused';
  const isFinished = state?.status === 'finished';
  const isActive = isRunning || isPaused || isFinished;
  const showWarning = Boolean(state) && isActive && remaining <= warningMs;
  const isCritical = isRunning && remaining <= Math.min(5000, warningMs);
  const secondsMode = Boolean(state) && isActive && remaining <= warningMs && remaining < 60_000;

  const parts = getTimeParts(remaining);
  const isLongClock = parts.hours > 0;
  const digits = state ? (secondsMode ? pad2(parts.seconds) : formatClock(remaining)) : '—:—';
  const numberKey = !state ? 'boot' : secondsMode ? 'seconds' : isLongClock ? 'long' : 'clock';
  const isFlyer = displayed === 'flyer';

  const statusText = !state
    ? 'Conectando'
    : !connected
      ? 'Sin señal'
      : isFinished
        ? 'Finalizado'
        : isPaused
          ? 'En pausa'
          : isRunning
            ? showWarning
              ? 'Últimos segundos'
              : 'En curso'
            : 'Listo';

  const note = isFinished
    ? 'Tiempo cumplido'
    : secondsMode
      ? 'Segundos'
      : isPaused
        ? 'En pausa'
        : isRunning
          ? 'En curso'
          : state
            ? 'Listo para iniciar'
            : 'Estableciendo conexión';

  const classes = [
    'timer-screen',
    isFlyer && 'is-viewing-flyer',
    showWarning && 'is-warning',
    secondsMode && 'is-seconds',
    isRunning && 'is-running',
    isPaused && 'is-paused',
    isFinished && 'is-finished',
    isCritical && 'is-critical',
    !connected && 'is-offline',
    phase === 'cover' && 'is-covering',
    phase === 'reveal' && 'is-revealing',
    cursorIdle && 'hide-cursor',
  ]
    .filter(Boolean)
    .join(' ');

  /* --------------------------- pantalla completa --------------------------- */
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key.toLowerCase() !== 'f' || event.repeat) return;
      toggleFullscreen();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleFullscreen]);

  /* ------------------------------- cursor --------------------------------- */
  useEffect(() => {
    let timer = setTimeout(() => setCursorIdle(true), 2800);
    const wake = () => {
      setCursorIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setCursorIdle(true), 2800);
    };
    window.addEventListener('mousemove', wake);
    window.addEventListener('mousedown', wake);
    window.addEventListener('touchstart', wake, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('mousedown', wake);
      window.removeEventListener('touchstart', wake);
    };
  }, []);

  return (
    <div className={classes}>
      <div className="stage-bg" aria-hidden="true">
        <span className="stage-halo" />
      </div>
      <div className="alert-wash" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <header className="rail rail-top">
        <div className="brandline">
          <span className="mark" aria-hidden="true" />
          <span className="brand-name">{EVENT.name}</span>
          <span className="brand-rule" aria-hidden="true" />
          <span className="brand-kicker">{EVENT.kicker}</span>
        </div>

        <div className="rail-status">
          <span className={`stage-status ${!connected ? 'is-offline' : ''}`}>
            <span className="status-dot" aria-hidden="true" />
            {statusText}
          </span>
        </div>
      </header>

      <main className="stage" aria-label="Pantalla del cronómetro">
        {isFlyer ? (
          <section className="flyer-stage">
            <FlyerLayer url={state?.flyerUrl} />
          </section>
        ) : (
          <section className="timer-stage">
            <p className="timer-label">{state?.label ?? 'Cronómetro'}</p>

            <div className="timer-figure">
              <div
                key={numberKey}
                className={`timer-number ${isLongClock && !secondsMode ? 'is-long' : ''}`}
                role="timer"
                aria-label={state ? `${formatClock(remaining)} restantes` : 'Conectando'}
              >
                {digits}
              </div>
            </div>


          </section>
        )}
      </main>

      <footer className="rail rail-bottom">
        {!isFullscreen && (
          <button
            type="button"
            className="fs-button"
            onClick={toggleFullscreen}
            title={EVENT.hint}
            aria-label="Poner la pantalla en pantalla completa"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
            </svg>
            <span>Pantalla completa</span>
          </button>
        )}
        <span className="rail-clock">{clockFormat.format(clockNow)}</span>
      </footer>

      <div className="veil" aria-hidden="true" />
    </div>
  );
}
