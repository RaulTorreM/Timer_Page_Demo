import { useEffect, useRef, useState } from 'react';
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

export default function AudioPanel({ audioUrl, audioName, connected, onToast }) {
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);
  const errorToastRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [startValue, setStartValue] = useState('00:00');
  const [loadError, setLoadError] = useState(false);

  const audioReady = duration > 0 && !loadError;
  const progress = duration > 0 ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setLoadError(false);
    setStartValue('00:00');
    errorToastRef.current = false;
    if (audioUrl) audio.load();
  }, [audioUrl]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

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
      onToast('Audio cargado. Pulsa reproducir cuando quieras.');
    } catch (error) {
      onToast(error.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const removeAudio = async () => {
    if (!audioUrl || removing) return;
    if (!window.confirm('¿Quitar el audio del panel?')) return;

    setRemoving(true);
    const response = await request('audio:set', { url: null, name: null });
    setRemoving(false);
    if (response.ok) {
      onToast('Audio quitado.');
    } else {
      onToast(response.error || 'No se pudo quitar el audio.', 'error');
    }
  };

  const handleMetadata = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    setLoadError(false);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl || loadError) return;

    if (audio.paused) {
      if (Number.isFinite(audio.duration) && audio.currentTime >= audio.duration - 0.05) {
        audio.currentTime = 0;
        setCurrent(0);
      }
      audio.play().catch(() => {
        onToast('El navegador no pudo iniciar el audio. Pulsa de nuevo.', 'error');
      });
    } else {
      audio.pause();
    }
  };

  const seekTo = (value) => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    const max = Number.isFinite(audio.duration) ? audio.duration : duration;
    const next = Math.min(Math.max(0, Number(value) || 0), max || 0);
    audio.currentTime = next;
    setCurrent(next);
  };

  const jumpToStart = () => {
    const parsed = parseTime(startValue);
    if (parsed === null) {
      onToast('Escribe un tiempo válido: 0:30, 1:15 o 90.', 'error');
      return;
    }
    if (!audioReady) {
      onToast('El audio todavía se está cargando.', 'error');
      return;
    }
    const next = Math.min(parsed, duration);
    seekTo(next);
    setStartValue(formatTime(next));
  };

  const handleError = () => {
    if (!audioUrl) return;
    setLoadError(true);
    setPlaying(false);
    if (!errorToastRef.current) {
      errorToastRef.current = true;
      onToast('No se pudo cargar el audio. Revisa el formato del archivo.', 'error');
    }
  };

  return (
    <section className="block">
      <div className="block-head">
        <h2>Audio</h2>
        <span className={`tag ${audioUrl ? (loadError ? 'is-dirty' : 'is-clean') : ''}`}>
          {audioUrl ? (loadError ? 'Revisar' : 'Cargado') : 'Sin audio'}
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
            MP3, M4A, MP4, WAV u OGG · hasta 100 MB. Se reproduce en el equipo donde está
            abierto este panel.
          </p>
        </div>
      ) : (
        <>
          <div className="audio-file">
            <div className="audio-file-name">
              <strong title={audioName || 'Audio'}>{audioName || 'Audio cargado'}</strong>
              <span className={`audio-file-state ${playing ? 'is-playing' : ''}`}>
                {playing ? (
                  <>
                    <span className="audio-live-dot" aria-hidden="true" />
                    En reproducción
                  </>
                ) : audioReady ? (
                  'Listo para reproducir'
                ) : loadError ? (
                  'No se pudo cargar'
                ) : (
                  'Cargando…'
                )}
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

          <audio
            ref={audioRef}
            src={audioUrl}
            preload="metadata"
            onLoadedMetadata={handleMetadata}
            onDurationChange={handleMetadata}
            onTimeUpdate={() => setCurrent(audioRef.current?.currentTime || 0)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false);
              setCurrent(audioRef.current?.duration || 0);
            }}
            onError={handleError}
            hidden
          />

          <div className="audio-player">
            <div className="audio-times">
              <span className="audio-current">{formatTime(current)}</span>
              <span className="audio-total">{formatTime(duration)}</span>
            </div>

            <div className="audio-scrub">
              <span className="audio-scrub-fill" style={{ width: `${progress}%` }} />
              <input
                type="range"
                min="0"
                max={duration || 1}
                step="0.1"
                value={Math.min(current, duration || 0)}
                onChange={(event) => seekTo(event.target.value)}
                className="audio-range"
                aria-label="Posición del audio"
                disabled={!audioReady}
              />
            </div>

            <div className="audio-controls">
              <button
                type="button"
                className="audio-play"
                onClick={togglePlay}
                disabled={!audioReady}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  {playing ? (
                    <path d="M4 3h3v10H4zM9 3h3v10H9z" />
                  ) : (
                    <path d="M5 3l8 5-8 5z" />
                  )}
                </svg>
                {playing ? 'Pausar' : 'Reproducir'}
              </button>

              <button
                type="button"
                className="btn btn-outline"
                onClick={() => seekTo(current - 10)}
                disabled={!audioReady}
              >
                −10 s
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => seekTo(current + 10)}
                disabled={!audioReady}
              >
                +10 s
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => seekTo(0)}
                disabled={!audioReady}
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
                  disabled={!audioReady}
                />
                <button
                  type="button"
                  className="btn btn-text"
                  onClick={jumpToStart}
                  disabled={!audioReady}
                >
                  Ir
                </button>
              </div>
            </div>

            {loadError ? (
              <p className="help is-error">
                No se pudo cargar este audio. Prueba con un MP3, M4A o WAV.
              </p>
            ) : (
              <p className="help">
                Se reproduce en este equipo. Conecta su salida a la mesa de sonido.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
