import fs from 'node:fs';
import path from 'node:path';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const MAX_DURATION = 24 * HOUR;

export const DEFAULT_STATE = {
  label: 'Tiempo de participación',
  durationMs: 5 * MINUTE,
  remainingMs: 5 * MINUTE,
  endsAt: null,
  status: 'idle', // idle | running | paused | finished
  view: 'timer', // timer | flyer
  flyerUrl: null,
  audioUrl: null,
  audioName: null,
  warningSeconds: 10,
  autoFlyer: true,
  autoFlyerDelaySeconds: 6,
  updatedAt: Date.now(),
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function sanitizeLabel(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return text || DEFAULT_STATE.label;
}

function sanitizeMediaUrl(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.startsWith('/uploads/') || text.startsWith('/') || /^https?:\/\//i.test(text)) {
    return text.slice(0, 600);
  }
  return null;
}

function sanitizeAudioName(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
  return text || 'Audio';
}

/**
 * Fuente de verdad del evento. Vive en el servidor para que la pantalla del
 * timer y el panel de control compartan exactamente el mismo estado.
 */
export class DebateStore {
  constructor({ file }) {
    this.file = file;
    this.listeners = new Set();
    this.finishTimer = null;
    this.autoViewTimer = null;
    this.clients = 0;
    this.state = this.#restore();
    this.#recoverAfterBoot();
    this.#scheduleFinish();
  }

  /* ------------------------------- plumbing ------------------------------- */

  #restore() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      const audioUrl = sanitizeMediaUrl(parsed.audioUrl);
      return {
        ...DEFAULT_STATE,
        ...parsed,
        status: ['idle', 'running', 'paused', 'finished'].includes(parsed.status)
          ? parsed.status
          : 'idle',
        view: ['timer', 'flyer'].includes(parsed.view) ? parsed.view : 'timer',
        durationMs: clamp(toNumber(parsed.durationMs, DEFAULT_STATE.durationMs), 1000, MAX_DURATION),
        remainingMs: clamp(toNumber(parsed.remainingMs, DEFAULT_STATE.remainingMs), 0, MAX_DURATION),
        warningSeconds: clamp(toNumber(parsed.warningSeconds, 10), 1, 300),
        autoFlyer: Boolean(parsed.autoFlyer),
        autoFlyerDelaySeconds: clamp(toNumber(parsed.autoFlyerDelaySeconds, 6), 1, 120),
        flyerUrl: sanitizeMediaUrl(parsed.flyerUrl),
        audioUrl,
        audioName: audioUrl ? sanitizeAudioName(parsed.audioName) : null,
      };
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  #persist() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.error('[store] No se pudo guardar el estado:', error.message);
    }
  }

  #commit(reason = 'update') {
    this.state.updatedAt = Date.now();
    this.#persist();
    this.#scheduleFinish();
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot, reason);
      } catch (error) {
        console.error('[store] listener error:', error);
      }
    }
    return snapshot;
  }

  #recoverAfterBoot() {
    if (this.state.status === 'running') {
      if (!this.state.endsAt || this.state.endsAt <= Date.now()) {
        this.state.status = 'finished';
        this.state.remainingMs = 0;
        this.state.endsAt = null;
      } else {
        this.state.remainingMs = this.state.endsAt - Date.now();
      }
    }
    if (this.state.status === 'paused') {
      this.state.remainingMs = clamp(this.state.remainingMs, 0, MAX_DURATION);
    }
  }

  #clearAutoView() {
    if (this.autoViewTimer) {
      clearTimeout(this.autoViewTimer);
      this.autoViewTimer = null;
    }
  }

  #scheduleFinish() {
    if (this.finishTimer) {
      clearTimeout(this.finishTimer);
      this.finishTimer = null;
    }
    if (this.state.status !== 'running' || !this.state.endsAt) return;

    const delay = this.state.endsAt - Date.now();
    if (delay > 2_147_000_000) return; // setTimeout no soporta delays mayores
    this.finishTimer = setTimeout(() => this.#finish(), Math.max(0, delay));
  }

  #finish() {
    if (this.state.status !== 'running') return;
    this.state.status = 'finished';
    this.state.remainingMs = 0;
    this.state.endsAt = null;
    this.#commit('finished');

    this.#clearAutoView();
    if (this.state.autoFlyer) {
      this.autoViewTimer = setTimeout(() => {
        if (this.state.status === 'finished') {
          this.state.view = 'flyer';
          this.#commit('auto-flyer');
        }
      }, this.state.autoFlyerDelaySeconds * 1000);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setClients(count) {
    this.clients = count;
  }

  snapshot() {
    const now = Date.now();
    const remainingMs =
      this.state.status === 'running' && this.state.endsAt
        ? Math.max(0, this.state.endsAt - now)
        : this.state.remainingMs;

    return {
      ...this.state,
      remainingMs,
      durationMs: Math.max(this.state.durationMs, 1000),
      serverNow: now,
      clients: this.clients,
    };
  }

  /* -------------------------------- actions ------------------------------- */

  applyConfig(input = {}) {
    const durationSeconds = clamp(
      Math.round(toNumber(input.durationSeconds, this.state.durationMs / 1000)),
      1,
      MAX_DURATION / 1000,
    );
    const durationMs = durationSeconds * 1000;
    const label = sanitizeLabel(input.label);
    const warningSeconds = clamp(Math.round(toNumber(input.warningSeconds, this.state.warningSeconds)), 1, 300);
    const autoFlyerDelaySeconds = clamp(
      Math.round(toNumber(input.autoFlyerDelaySeconds, this.state.autoFlyerDelaySeconds)),
      1,
      120,
    );
    const autoFlyer = input.autoFlyer === undefined ? this.state.autoFlyer : Boolean(input.autoFlyer);

    const durationChanged = durationMs !== this.state.durationMs;

    this.state.label = label;
    this.state.warningSeconds = warningSeconds;
    this.state.autoFlyer = autoFlyer;
    this.state.autoFlyerDelaySeconds = autoFlyerDelaySeconds;

    if (durationChanged) {
      this.state.durationMs = durationMs;
      this.state.remainingMs = durationMs;
      this.state.endsAt = null;
      this.state.status = 'idle';
    }

    return this.#commit('config');
  }

  start() {
    if (this.state.status === 'running') return this.snapshot();

    if (this.state.remainingMs <= 0 || this.state.status === 'finished') {
      this.state.remainingMs = this.state.durationMs;
    }

    this.state.endsAt = Date.now() + this.state.remainingMs;
    this.state.status = 'running';
    this.#clearAutoView();
    return this.#commit('start');
  }

  pause() {
    if (this.state.status !== 'running') return this.snapshot();
    this.state.remainingMs = Math.max(0, (this.state.endsAt ?? Date.now()) - Date.now());
    this.state.endsAt = null;
    this.state.status = 'paused';
    return this.#commit('pause');
  }

  reset() {
    this.#clearAutoView();
    this.state.remainingMs = this.state.durationMs;
    this.state.endsAt = null;
    this.state.status = 'idle';
    return this.#commit('reset');
  }

  addTime(deltaMs) {
    const delta = clamp(toNumber(deltaMs, 0), -MAX_DURATION, MAX_DURATION);
    if (!delta) return this.snapshot();

    this.#clearAutoView();

    if (this.state.status === 'running' && this.state.endsAt) {
      const next = this.state.endsAt + delta;
      if (next <= Date.now()) {
        this.state.endsAt = Date.now();
        this.state.remainingMs = 0;
        this.#finish();
        return this.snapshot();
      }
      this.state.endsAt = next;
      this.state.remainingMs = next - Date.now();
      return this.#commit('add-time');
    }

    this.state.remainingMs = clamp(this.state.remainingMs + delta, 0, MAX_DURATION);
    if (this.state.remainingMs === 0) {
      this.state.status = 'finished';
    } else if (this.state.status === 'finished') {
      this.state.status = 'paused';
    }
    return this.#commit('add-time');
  }

  setView(view) {
    const safeView = view === 'flyer' ? 'flyer' : 'timer';
    if (this.state.view === safeView) return this.snapshot();
    this.state.view = safeView;
    this.#clearAutoView();
    return this.#commit('view');
  }

  setFlyer(url, { show = false } = {}) {
    this.state.flyerUrl = sanitizeMediaUrl(url);
    if (show) this.state.view = 'flyer';
    return this.#commit('flyer');
  }

  setAudio(url, name = null) {
    const audioUrl = sanitizeMediaUrl(url);
    this.state.audioUrl = audioUrl;
    this.state.audioName = audioUrl ? sanitizeAudioName(name) : null;
    return this.#commit('audio');
  }
}
