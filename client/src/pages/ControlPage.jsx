import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LivePreview from '../components/LivePreview.jsx';
import { useDebateState } from '../hooks/useDebateState.js';
import { useNow, useTicker } from '../hooks/useTicker.js';
import { request } from '../lib/socket.js';
import { clamp, formatClock, formatDuration, STATUS_LABELS } from '../lib/time.js';
import { CONTROL, EVENT } from '../config.js';
import '../styles/control.css';

const TIME_PRESETS = [
  { label: '1 min', seconds: 60 },
  { label: '2 min', seconds: 120 },
  { label: '3 min', seconds: 180 },
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
];

const LABEL_PRESETS = [
  'Tiempo de participación',
  'Tiempo de réplica',
  'Inicia en',
  'El debate comienza en',
];

const padTime = (value) => String(Math.max(0, value)).padStart(2, '0');

function toDraft(state) {
  const totalSeconds = Math.round(state.durationMs / 1000);
  return {
    label: state.label,
    minutes: padTime(Math.floor(totalSeconds / 60)),
    seconds: padTime(totalSeconds % 60),
    warningSeconds: state.warningSeconds,
    autoFlyer: state.autoFlyer,
    autoFlyerDelaySeconds: state.autoFlyerDelaySeconds,
  };
}

const parseDraftSeconds = (draft) =>
  clamp(
    (Number.parseInt(draft.minutes, 10) || 0) * 60 + (Number.parseInt(draft.seconds, 10) || 0),
    1,
    86400,
  );

const clockFormat = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dateFormat = new Intl.DateTimeFormat('es-PE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export default function ControlPage() {
  const { state, connected, clients } = useDebateState();
  const tick = useTicker(state?.status === 'running', 12);
  const clockNow = useNow(1000);

  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [flyerUrlInput, setFlyerUrlInput] = useState('');
  const [toasts, setToasts] = useState([]);
  const fileInputRef = useRef(null);
  const serverSigRef = useRef(null);
  const savedTimerRef = useRef(null);

  const pushToast = useCallback((message, tone = 'ok') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

  useEffect(() => () => clearTimeout(savedTimerRef.current), []);

  /* --------------------------- sincronizar borrador -------------------------- */
  const serverSig = state
    ? JSON.stringify([
        state.label,
        state.durationMs,
        state.warningSeconds,
        state.autoFlyer,
        state.autoFlyerDelaySeconds,
      ])
    : null;

  useEffect(() => {
    if (!serverSig || !state) return;
    if (serverSigRef.current === serverSig) return;
    if (dirty) return;
    serverSigRef.current = serverSig;
    setDraft(toDraft(state));
  }, [serverSig, dirty, state]);

  useEffect(() => {
    if (state?.flyerUrl && !flyerUrlInput) setFlyerUrlInput(state.flyerUrl);
  }, [state?.flyerUrl, flyerUrlInput]);

  /* ------------------------------ tiempo restante ---------------------------- */
  const remaining = useMemo(() => {
    if (!state) return 0;
    if (state.status !== 'running') return state.remainingMs;
    return Math.max(0, state.remainingMs - (tick - state.receivedAt));
  }, [state, tick]);

  const isRunning = state?.status === 'running';
  const warningMs = (state?.warningSeconds ?? 10) * 1000;
  const isWarning = Boolean(state) && state.status !== 'idle' && remaining <= warningMs;
  const progress = state ? clamp(remaining / Math.max(1, state.durationMs), 0, 1) : 0;
  const draftSeconds = draft ? parseDraftSeconds(draft) : 0;

  const dateline = useMemo(() => {
    const date = dateFormat.format(clockNow);
    return `${CONTROL.subtitle} · ${date.charAt(0).toUpperCase()}${date.slice(1)}`;
  }, [clockNow]);

  /* -------------------------------- acciones -------------------------------- */
  const updateDraft = (patch) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
  };

  const updateDuration = (field, raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, field === 'minutes' ? 4 : 3);
    updateDraft({ [field]: digits });
  };

  const normalizeDuration = () => {
    if (!draft) return;
    const total = parseDraftSeconds(draft);
    setDraft((current) =>
      current
        ? { ...current, minutes: padTime(Math.floor(total / 60)), seconds: padTime(total % 60) }
        : current,
    );
  };

  const run = async (event, payload) => {
    const response = await request(event, payload);
    if (!response.ok) {
      pushToast(response.error || 'No se pudo ejecutar la acción.', 'error');
    }
    return response;
  };

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    const response = await request('config:update', {
      label: draft.label,
      durationSeconds: draftSeconds,
      warningSeconds: clamp(Math.round(Number(draft.warningSeconds) || 10), 1, 300),
      autoFlyer: Boolean(draft.autoFlyer),
      autoFlyerDelaySeconds: clamp(Math.round(Number(draft.autoFlyerDelaySeconds) || 6), 1, 120),
    });
    setSaving(false);

    if (response.ok) {
      setDirty(false);
      setJustSaved(true);
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setJustSaved(false), 2400);
      pushToast('Cambios guardados y aplicados.');
    } else {
      pushToast(response.error || 'No se pudieron guardar los cambios.', 'error');
    }
  };

  const discard = () => {
    if (!state) return;
    setDraft(toDraft(state));
    setDirty(false);
    serverSigRef.current = serverSig;
  };

  const toggleTimer = () => run(isRunning ? 'timer:pause' : 'timer:start');
  const resetTimer = () => {
    if (window.confirm('¿Reiniciar el cronómetro al tiempo configurado?')) run('timer:reset');
  };
  const addTime = (seconds) => run('timer:add', { seconds });
  const setView = (view) => run('view:set', { view });

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/upload', { method: 'POST', body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'No se pudo subir la imagen.');
      }
      setFlyerUrlInput(payload.url);
      pushToast('Flyer cargado. Proyéctalo con «Mostrar flyer».');
    } catch (error) {
      pushToast(error.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const applyFlyerUrl = async () => {
    const value = flyerUrlInput.trim();
    if (!value) {
      pushToast('Escribe una ruta (/flyer.jpg) o una URL http(s).', 'error');
      return;
    }
    if (!/^(https?:\/\/|\/)/i.test(value)) {
      pushToast('La ruta debe empezar con “/” o con “http(s)://”.', 'error');
      return;
    }
    const response = await run('flyer:set', { url: value });
    if (response.ok) pushToast('Flyer actualizado.');
  };

  const removeFlyer = async () => {
    if (!state?.flyerUrl) return;
    if (!window.confirm('¿Quitar el flyer actual?')) return;
    const response = await run('flyer:set', { url: null });
    if (response.ok) {
      setFlyerUrlInput('');
      pushToast('Flyer eliminado.');
    }
  };

  /* ---------------------------- atajos de teclado ---------------------------- */
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;

      if (event.code === 'Space') {
        event.preventDefault();
        toggleTimer();
      } else if (event.key.toLowerCase() === 'r') {
        resetTimer();
      } else if (event.key.toLowerCase() === 'f') {
        setView(state?.view === 'flyer' ? 'timer' : 'flyer');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.status, state?.view]);

  if (!state || !draft) {
    return (
      <div className="control-page">
        <div className="sheet">
          <p className="boot">Conectando con la mesa de tiempo…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="control-page">
      <div className="grain" aria-hidden="true" />

      <div className="sheet">
        <header className="masthead">
          <div className="ctl-brandline">
            <span className="ctl-mark" aria-hidden="true" />
            <span className="ctl-brand-name">{EVENT.name}</span>
            <span className="ctl-brand-rule" aria-hidden="true" />
            <span className="ctl-brand-kicker">{EVENT.kicker}</span>
          </div>

          <div className="masthead-right">
            <span className={`signal ${connected ? 'is-on' : 'is-off'}`}>
              <span className="signal-dot" aria-hidden="true" />
              {connected ? 'En vivo' : 'Sin señal'}
            </span>
            <span className="masthead-clock">{clockFormat.format(clockNow)}</span>
          </div>
        </header>

        <div className="titleline">
          <div>
            <h1>{CONTROL.title}</h1>
            <p className="dateline">{dateline}</p>
          </div>
          <a className="open-link" href="/timer" target="_blank" rel="noreferrer">
            Abrir proyección en otra ventana
          </a>
        </div>

        <div className="layout">
          <main className="main-col">
            {/* -------------------------------- tiempo -------------------------------- */}
            <section className="block">
              <div className="block-head">
                <h2>Tiempo y etiqueta</h2>
                <span className={`tag ${dirty ? 'is-dirty' : 'is-clean'}`}>
                  {dirty ? 'Sin guardar' : justSaved ? 'Guardado' : 'Aplicado'}
                </span>
              </div>

              <div className="field">
                <label htmlFor="label">Etiqueta en pantalla</label>
                <input
                  id="label"
                  className="line-input"
                  type="text"
                  maxLength={120}
                  value={draft.label}
                  onChange={(event) => updateDraft({ label: event.target.value })}
                  placeholder="Tiempo de participación"
                />
                <div className="quick-row">
                  {LABEL_PRESETS.map((preset) => (
                    <button
                      type="button"
                      key={preset}
                      className={`preset ${draft.label === preset ? 'is-active' : ''}`}
                      onClick={() => updateDraft({ label: preset })}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Duración del cronómetro</label>
                <div className="duration-editor">
                  <div className="big-field">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      aria-label="Minutos"
                      value={draft.minutes}
                      style={{ width: `${Math.max(2, draft.minutes.length) + 0.1}ch` }}
                      onChange={(event) => updateDuration('minutes', event.target.value)}
                      onBlur={normalizeDuration}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                      }}
                    />
                    <span>min</span>
                  </div>
                  <span className="big-colon" aria-hidden="true">
                    :
                  </span>
                  <div className="big-field">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      aria-label="Segundos"
                      value={draft.seconds}
                      style={{ width: `${Math.max(2, draft.seconds.length) + 0.1}ch` }}
                      onChange={(event) => updateDuration('seconds', event.target.value)}
                      onBlur={normalizeDuration}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                      }}
                    />
                    <span>seg</span>
                  </div>

                  <div className="duration-meta">
                    <span className="duration-total">{formatClock(draftSeconds * 1000)}</span>
                    <span className="duration-note">{formatDuration(draftSeconds * 1000)}</span>
                  </div>
                </div>

                <div className="quick-row">
                  {TIME_PRESETS.map((preset) => (
                    <button
                      type="button"
                      key={preset.seconds}
                      className={`preset ${draftSeconds === preset.seconds ? 'is-active' : ''}`}
                      onClick={() =>
                        updateDraft({
                          minutes: padTime(Math.floor(preset.seconds / 60)),
                          seconds: padTime(preset.seconds % 60),
                        })
                      }
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field-grid">
                <div className="field">
                  <label htmlFor="warning">Alerta roja</label>
                  <div className="inline-field">
                    <input
                      id="warning"
                      type="number"
                      min="1"
                      max="300"
                      value={draft.warningSeconds}
                      onChange={(event) =>
                        updateDraft({
                          warningSeconds:
                            event.target.value === ''
                              ? ''
                              : clamp(Math.round(Number(event.target.value)), 1, 300),
                        })
                      }
                    />
                    <span>segundos finales</span>
                  </div>
                  <p className="help">
                    El escenario pasa a rojo y el número cambia a segundos.
                  </p>
                </div>

                <div className="field">
                  <label>Flyer automático</label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={draft.autoFlyer}
                      onChange={(event) => updateDraft({ autoFlyer: event.target.checked })}
                    />
                    <span className="check-box" aria-hidden="true" />
                    <span>Mostrar al terminar</span>
                  </label>
                  <div className={`inline-field is-delay ${draft.autoFlyer ? '' : 'is-disabled'}`}>
                    <span className="inline-prefix">Esperar</span>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      disabled={!draft.autoFlyer}
                      value={draft.autoFlyerDelaySeconds}
                      onChange={(event) =>
                        updateDraft({
                          autoFlyerDelaySeconds:
                            event.target.value === ''
                              ? ''
                              : clamp(Math.round(Number(event.target.value)), 1, 120),
                        })
                      }
                    />
                    <span>segundos</span>
                  </div>
                </div>
              </div>

              <div className="actions">
                <button
                  type="button"
                  className="btn btn-solid"
                  onClick={save}
                  disabled={!connected || saving}
                >
                  {saving ? 'Guardando…' : justSaved ? 'Cambios guardados' : 'Guardar cambios'}
                </button>
                {dirty && (
                  <button type="button" className="btn btn-text" onClick={discard}>
                    Descartar
                  </button>
                )}
                <span className="actions-note">
                  Un tiempo nuevo reinicia el cronómetro.
                </span>
              </div>
            </section>

            {/* --------------------------------- flyer --------------------------------- */}
            <section className="block">
              <div className="block-head">
                <h2>Flyer</h2>
                {state.flyerUrl && <span className="tag is-clean">Cargado</span>}
              </div>

              <div className="flyer-row">
                <div className="flyer-thumb">
                  {state.flyerUrl ? (
                    <img src={state.flyerUrl} alt="Flyer actual" />
                  ) : (
                    <span className="flyer-thumb-empty">Sin flyer</span>
                  )}
                </div>

                <div className="flyer-side">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                    hidden
                    onChange={handleUpload}
                  />

                  <div className="actions is-tight">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? 'Subiendo…' : 'Subir imagen'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-text"
                      onClick={() => setView('flyer')}
                      disabled={!state.flyerUrl}
                    >
                      Mostrar flyer
                    </button>
                    {state.flyerUrl && (
                      <button type="button" className="btn btn-text is-danger" onClick={removeFlyer}>
                        Quitar
                      </button>
                    )}
                  </div>

                  <div className="url-row">
                    <input
                      className="line-input"
                      type="text"
                      value={flyerUrlInput}
                      onChange={(event) => setFlyerUrlInput(event.target.value)}
                      placeholder="/flyer.jpg o https://…"
                      spellCheck="false"
                      aria-label="Ruta o URL del flyer"
                    />
                    <button type="button" className="btn btn-outline" onClick={applyFlyerUrl}>
                      Aplicar
                    </button>
                  </div>

                  <p className="help">
                    También puedes copiar el archivo a <code>client/public/flyer.jpg</code> y usar{' '}
                    <code>/flyer.jpg</code>.
                  </p>
                </div>
              </div>
            </section>
          </main>

          {/* ------------------------------ columna monitor ----------------------------- */}
          <aside className="side-col">
            <section className="monitor">
              <div className="monitor-head">
                <span>Proyección</span>
                <span className="monitor-view">
                  {state.view === 'flyer' ? 'Flyer' : 'Timer'}
                </span>
              </div>

              <div className="monitor-screen">
                <LivePreview />
              </div>

              <div className="monitor-body">
                <div className={`monitor-time ${isWarning ? 'is-warning' : ''}`}>
                  {formatClock(remaining)}
                </div>
                <div className="monitor-sub">
                  <span className="monitor-label">{state.label}</span>
                  <span className="monitor-state">
                    <span className="monitor-dot" aria-hidden="true" />
                    {STATUS_LABELS[state.status]}
                  </span>
                </div>

                <div className="monitor-progress" aria-hidden="true">
                  <span
                    className={isWarning ? 'is-warning' : ''}
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>

                <div className="monitor-actions">
                  <button
                    type="button"
                    className={`monitor-btn ${isRunning ? 'is-signal' : 'is-bone'}`}
                    onClick={toggleTimer}
                    disabled={!connected}
                  >
                    {isRunning ? 'Pausar' : state.status === 'paused' ? 'Reanudar' : 'Iniciar'}
                  </button>
                  <button
                    type="button"
                    className="monitor-btn is-line"
                    onClick={resetTimer}
                    disabled={!connected}
                  >
                    Reiniciar
                  </button>
                </div>

                <div className="monitor-nudge">
                  <button
                    type="button"
                    className="monitor-btn is-small"
                    onClick={() => addTime(30)}
                    disabled={!connected}
                  >
                    +30 s
                  </button>
                  <button
                    type="button"
                    className="monitor-btn is-small"
                    onClick={() => addTime(60)}
                    disabled={!connected}
                  >
                    +1 min
                  </button>
                  <span className="monitor-caption">Los controles se aplican al instante.</span>
                </div>

                <div className="monitor-switch" role="group" aria-label="Vista de la proyección">
                  <button
                    type="button"
                    className={state.view === 'timer' ? 'is-active' : ''}
                    onClick={() => setView('timer')}
                  >
                    Timer
                  </button>
                  <button
                    type="button"
                    className={state.view === 'flyer' ? 'is-active' : ''}
                    onClick={() => setView('flyer')}
                  >
                    Flyer
                  </button>
                </div>
              </div>
            </section>

            <section className="block block-tight">
              <div className="block-head">
                <h2>Estado</h2>
              </div>
              <dl className="ledger">
                <div>
                  <dt>Servidor</dt>
                  <span className="leader" aria-hidden="true" />
                  <dd>{connected ? 'Conectado' : 'Desconectado'}</dd>
                </div>
                <div>
                  <dt>Pantallas</dt>
                  <span className="leader" aria-hidden="true" />
                  <dd>{clients}</dd>
                </div>
                <div>
                  <dt>Cronómetro</dt>
                  <span className="leader" aria-hidden="true" />
                  <dd>{STATUS_LABELS[state.status]}</dd>
                </div>
                <div>
                  <dt>Restante</dt>
                  <span className="leader" aria-hidden="true" />
                  <dd className={isWarning ? 'is-warning' : ''}>{formatClock(remaining)}</dd>
                </div>
                <div>
                  <dt>Sin guardar</dt>
                  <span className="leader" aria-hidden="true" />
                  <dd>{dirty ? 'Sí' : 'No'}</dd>
                </div>
              </dl>

              <div className="shortcuts">
                <span className="shortcut">
                  <kbd>Espacio</kbd> iniciar / pausar
                </span>
                <span className="shortcut">
                  <kbd>R</kbd> reiniciar
                </span>
                <span className="shortcut">
                  <kbd>F</kbd> timer / flyer
                </span>
              </div>
            </section>

            <section className="block block-tight">
              <div className="block-head">
                <h2>Cómo operar</h2>
              </div>
              <ul className="guide">
                <li>
                  <span className="guide-mark" aria-hidden="true" />
                  Ajusta el tiempo y guarda: la proyección se actualiza sola.
                </li>
                <li>
                  <span className="guide-mark" aria-hidden="true" />
                  Abre la proyección en otra ventana y pulsa <kbd>F</kbd> para pantalla completa.
                </li>
                <li>
                  <span className="guide-mark" aria-hidden="true" />
                  Inicia, pausa y cambia al flyer cuando lo pida la mesa.
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </div>

      {dirty && (
        <div className="save-bar" role="status">
          <span className="save-bar-text">
            <span className="ctl-mark" aria-hidden="true" />
            <span>
              Cambios sin guardar. La proyección mantiene la configuración anterior.
            </span>
          </span>
          <div className="save-bar-actions">
            <button type="button" className="save-btn is-line" onClick={discard}>
              Descartar
            </button>
            <button
              type="button"
              className="save-btn is-signal"
              onClick={save}
              disabled={!connected || saving}
            >
              {saving ? 'Guardando…' : 'Guardar y confirmar'}
            </button>
          </div>
        </div>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone === 'error' ? 'is-error' : ''}`}>
            <span className="toast-mark" aria-hidden="true" />
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
