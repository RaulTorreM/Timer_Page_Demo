import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FlyerLayer from '../components/FlyerLayer.jsx';
import { useDebateState } from '../hooks/useDebateState.js';
import { useFullscreen } from '../hooks/useFullscreen.js';
import { useStageTransition } from '../hooks/useStageTransition.js';
import { useNow, useTicker } from '../hooks/useTicker.js';
import { socket } from '../lib/socket.js';
import { formatClock, getTimeParts, pad2 } from '../lib/time.js';
import '../styles/timer.css';

const clockFormat = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const IS_PREVIEW = new URLSearchParams(window.location.search).get('preview') === '1';

export default function TimerPage() {
  const { state, connected } = useDebateState();
  const isRunning = state?.status === 'running';
  const clockNow = useNow(1000);
  const [cursorIdle, setCursorIdle] = useState(false);
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const { displayed, phase } = useStageTransition(state?.view ?? 'timer');
  const tick = useTicker(isRunning && displayed === 'timer', 30);

  const audioRef = useRef(null);
  const reportedDurationRef = useRef(null);
  const [audioDurationLocal, setAudioDurationLocal] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const audioUrl = state?.audioUrl || null;
  const audioStatus = state?.audioStatus || 'idle';

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

  /* --------------------------------- audio --------------------------------- */
  useEffect(() => {
    setAudioDurationLocal(0);
    setAudioBlocked(false);
    reportedDurationRef.current = null;
  }, [audioUrl]);

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const durationMs = Math.round(duration * 1000);
    setAudioDurationLocal(durationMs);

    if (durationMs > 0) {
      const signature = `${audioUrl}:${durationMs}`;
      if (reportedDurationRef.current !== signature) {
        reportedDurationRef.current = signature;
        socket.emit('audio:duration', { durationMs });
      }
    }
  };

  const handleEnded = () => {
    if (!audioUrl) return;
    socket.emit('audio:ended');
  };

  const syncAudio = useCallback(() => {
    if (IS_PREVIEW || !audioUrl) return;
    const audio = audioRef.current;
    if (!audio) return;

    const expectedMs =
      audioStatus === 'playing'
        ? (state?.audioPositionMs || 0) + (performance.now() - (state?.receivedAt || performance.now()))
        : state?.audioPositionMs || 0;
    const durationMs = audioDurationLocal || state?.audioDurationMs || 0;
    const target = Math.max(0, expectedMs / 1000);
    const safeTarget = durationMs > 0 ? Math.min(target, durationMs / 1000) : target;

    if (audioStatus === 'playing') {
      if (audio.readyState >= 1 && Math.abs(audio.currentTime - safeTarget) > 0.6) {
        audio.currentTime = safeTarget;
      }
      if (audio.paused) {
        audio
          .play()
          .then(() => setAudioBlocked(false))
          .catch((error) => {
            if (error?.name === 'NotAllowedError') setAudioBlocked(true);
          });
      }
      return;
    }

    if (!audio.paused) audio.pause();
    if (audio.readyState >= 1) {
      if (audioStatus === 'idle') {
        audio.currentTime = 0;
      } else if (Math.abs(audio.currentTime - safeTarget) > 0.3) {
        audio.currentTime = safeTarget;
      }
    }
  }, [audioUrl, audioStatus, state, audioDurationLocal]);

  useEffect(() => {
    syncAudio();
  }, [syncAudio]);

  return (
    <div className={classes}>
      <div className="stage-bg" aria-hidden="true">
        <span className="stage-halo" />
      </div>
      <div className="alert-wash" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      

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
            title="Pantalla completa (F)"
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

      {isFullscreen && (
        <button
          type="button"
          className="fs-button is-icon is-floating"
          onClick={toggleFullscreen}
          title="Salir de pantalla completa (F o Esc)"
          aria-label="Salir de pantalla completa"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
          </svg>
        </button>
      )}

      {!IS_PREVIEW && audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="auto"
          onLoadedMetadata={handleLoadedMetadata}
          onDurationChange={handleLoadedMetadata}
          onEnded={handleEnded}
          hidden
        />
      )}

      {!IS_PREVIEW && audioUrl && audioBlocked && audioStatus === 'playing' && (
        <button type="button" className="audio-unlock" onClick={syncAudio}>
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M3 6.5h2.5L9 4v8L5.5 9.5H3z" />
            <path d="M11 5.5a3.6 3.6 0 010 5" />
          </svg>
          Activar audio
        </button>
      )}

      <div className="veil" aria-hidden="true" />
    </div>
  );
}
