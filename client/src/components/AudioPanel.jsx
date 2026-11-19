import { useEffect, useMemo, useRef, useState } from 'react';
import { useTicker } from '../hooks/useTicker.js';
import { request } from '../lib/socket.js';

const MAX_SIZE = 100 * 1024 * 1024;

const pad = (value) => String(Math.max(0, value)).padStart(2, '0');

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

function parseTime(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parts = text.split(':');
  if (parts.length < 1 || parts.length > 3) return null;
  const numbers = parts.map((part) => {
    const number = Number(part.replace(',', '.'));
    return Number.isFinite(number) && number >= 0 ? number : NaN;
  });
  if (numbers.some(Number.isNaN)) return null;
  if (numbers.length === 1) return numbers[0];
  if (numbers.length === 2) return numbers[0] * 60 + numbers[1];
  return numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
}

export default function AudioPanel({
  audioUrl,
  audioName,
  audioStatus,
  audioPositionMs,
  audioDurationMs,
  receivedAt,
  connected,
  onToast,
}) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [startValue, setStartValue] = useState('00:00');
  const [scrub, setScrub] = useState(null);

  const isPlaying = audioStatus === 'playing';
  const tick = useTicker(isPlaying, 12);
  const durationMs = Math.max(0, Number(audioDurationMs) || 0);
  const ready = Boolean(audioUrl) && durationMs > 0;

  useEffect(() => {
    setStartValue('00:00');
    setScrub(null);
  }, [audioUrl]);

  const positionMs = useMemo(() => {
    if (!audioUrl) return 0;
    const base = Math.max(0, Number(audioPositionMs) || 0);
    if (!isPlaying) return Math.min(base, durationMs || base);
    const live = base + Math.max(0, tick - (Number(receivedAt) || 0));
    return Math.min(live, durationMs || live);
  }, [audioUrl, isPlaying, audioPositionMs, durationMs, tick, receivedAt]);

  const shownPosition = scrub ?? positionMs;
  const progress = durationMs > 0 ? Math.min(100, Math.max(0, (shownPosition / durationMs) * 100)) : 0;

  const send = async (event, payload = {}) => {
    if (!connected) {
      onToast('Sin conexión con el servidor.', 'error');
      return null;
    }
    const response = await request(event, payload);
    if (!response?.ok) {
      onToast(response?.error || 'No se pudo controlar el audio.', 'error');
      return null;
    }
    return response;
  };

  const togglePlay = () => {
    if (!ready) return;
    if (isPlaying) {
      send('audio:pause');
      return;
    }
    const from = audioStatus === 'finished' ? 0 : Math.round(positionMs);
    send('audio:play', { positionMs: from });
  };

  const seekTo = (value) => {
    if (!ready) return;
    const next = Math.min(Math.max(0, Math.round(Number(value) || 0)), durationMs);
    setScrub(null);
    send('audio:seek', { positionMs: next });
  };

  const commitScrub = () => {
    if (scrub !== null) seekTo(scrub);
  };

  const jumpToStart = () => {
    const parsed = parseTime(startValue);
    if (parsed === null) {
      onToast('Escribe un tiempo válido: 0:30, 1:15 o 90.', 'error');
      return;
    }
    if (!ready) {
      onToast('El audio todavía se está cargando en la pantalla.', 'error');
      return;
    }
    const ms = Math.min(parsed * 1000, durationMs);
    seekTo(ms);
    setStartValue(formatTime(ms / 1000));
  };

  const openPicker = () => fileInputRef.current?.click();

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const typeOk =
      file.type.startsWith('audio/') ||
      file.type === 'video/mp4' ||
      file.type === 'video/webm';
    const extensionOk = /\.(mp3|m4a|mp4|wav|ogg|aac|weba|webm)$/i.test(file.name);

    if (!typeOk && !extensionOk) {
      onToast('Formato no admitido. Usa MP3, M4A, MP4, WAV u OGG.', 'error');
      return;
    }
    if (file.size > MAX_SIZE) {
      onToast('El audio supera los 100 MB.', 'error');
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/audio', { method: 'POST', body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'No se pudo subir el audio.');
      }
      onToast('Audio cargado. Ya está disponible en la pantalla del timer.');
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const removeAudio = async () => {
    if (!audioUrl || removing) return;
    if (!window.confirm('¿Quitar el audio del panel y de la pantalla?')) return;

    setRemoving(true);
    const response = await request('audio:set', { url: null, name: null });
    setRemoving(false);
    if (response.ok) {
      onToast('Audio quitado.');
    } else {
      onToast(response.error || 'No se pudo quitar el audio.', 'error');
    }
  };

  const stateLabel = isPlaying
    ? 'En reproducción'
    : audioStatus === 'paused'
      ? 'En pausa'
      : audioStatus === 'finished'
        ? 'Finalizado'
        : ready
          ? 'Listo para reproducir'
          : audioUrl
            ? 'Cargando en la pantalla…'
            : '';

  return (
    <section className="block">
      <div className="block-head">
        <h2>Audio</h2>
        <span className={`tag ${audioUrl ? 'is-clean' : ''}`}>
          {audioUrl ? 'Cargado' : 'Sin audio'}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/mp4,.mp3,.m4a,.mp4,.wav,.ogg,.aac"
        hidden
        onChange={handleFile}
      />

      {!audioUrl ? (
        <div className="audio-empty">
          <button
            type="button"
            className="btn btn-outline"
            onClick={openPicker}
            disabled={uploading || !connected}
          >
            {uploading ? 'Subiendo…' : 'Subir audio'}
          </button>
          <p className="help">
            MP3, M4A, MP4, WAV u OGG · hasta 100 MB. Se reproduce en la pantalla del timer;
            desde aquí solo lo controlas.
          </p>
        </div>
      ) : (
        <>
          <div className="audio-file">
            <div className="audio-file-name">
              <strong title={audioName || 'Audio'}>{audioName || 'Audio cargado'}</strong>
              <span className={`audio-file-state ${isPlaying ? 'is-playing' : ''}`}>
                {isPlaying && <span className="audio-live-dot" aria-hidden="true" />}
                {stateLabel}
              </span>
            </div>

            <button
              type="button"
              className="btn btn-text"
              onClick={openPicker}
              disabled={uploading || !connected}
            >
              {uploading ? 'Subiendo…' : 'Cambiar'}
            </button>
            <button
              type="button"
              className="btn btn-text is-danger"
              onClick={removeAudio}
              disabled={removing || !connected}
            >
              {removing ? 'Quitando…' : 'Quitar'}
            </button>
          </div>

          <div className="audio-player">
            <div className="audio-times">
              <span className="audio-current">{formatTime(shownPosition / 1000)}</span>
              <span className="audio-total">{formatTime(durationMs / 1000)}</span>
            </div>

            <div className="audio-scrub">
              <span className="audio-scrub-fill" style={{ width: `${progress}%` }} />
              <input
                type="range"
                min="0"
                max={Math.max(durationMs, 1)}
                step="100"
                value={Math.min(shownPosition, Math.max(durationMs, 1))}
                onChange={(event) => setScrub(Number(event.target.value))}
                onPointerUp={commitScrub}
                onTouchEnd={commitScrub}
                onKeyUp={commitScrub}
                onBlur={commitScrub}
                className="audio-range"
                aria-label="Posición del audio"
                disabled={!ready}
              />
            </div>

            <div className="audio-controls">
              <button
                type="button"
                className="audio-play"
                onClick={togglePlay}
                disabled={!ready || !connected}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  {isPlaying ? (
                    <path d="M4 3h3v10H4zM9 3h3v10H9z" />
                  ) : (
                    <path d="M5 3l8 5-8 5z" />
                  )}
                </svg>
                {isPlaying ? 'Pausar' : 'Reproducir'}
              </button>

              <button
                type="button"
                className="btn btn-outline"
                onClick={() => seekTo(positionMs - 10000)}
                disabled={!ready || !connected}
              >
                −10 s
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => seekTo(positionMs + 10000)}
                disabled={!ready || !connected}
              >
                +10 s
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => seekTo(0)}
                disabled={!ready || !connected}
              >
                Reiniciar
              </button>

              <div className="audio-start">
                <label htmlFor="audio-start">Iniciar en</label>
                <input
                  id="audio-start"
                  className="audio-start-input"
                  type="text"
                  inputMode="numeric"
                  value={startValue}
                  onChange={(event) => setStartValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      jumpToStart();
                    }
                  }}
                  placeholder="00:00"
                  maxLength={8}
                  disabled={!ready}
                />
                <button
                  type="button"
                  className="btn btn-text"
                  onClick={jumpToStart}
                  disabled={!ready || !connected}
                >
                  Ir
                </button>
              </div>
            </div>

            {ready ? (
              <p className="help">
                Se reproduce en la pantalla del timer. Si el navegador lo bloquea, pulsa
                «Activar audio» en esa pantalla.
              </p>
            ) : (
              <p className="help">
                Abre la pantalla del timer para cargar el audio y habilitar los controles.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
