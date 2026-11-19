export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const pad2 = (value) => String(Math.max(0, value)).padStart(2, '0');

/** Separa milisegundos en horas / minutos / segundos (redondeo hacia arriba). */
export function getTimeParts(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { hours, minutes, seconds, totalSeconds };
}

/** "05:00" o "1:05:00" */
export function formatClock(ms) {
  const { hours, minutes, seconds } = getTimeParts(ms);
  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(seconds)}` : `${pad2(minutes)}:${pad2(seconds)}`;
}

/** "5 min 30 s" (para textos de apoyo) */
export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds} s`;
  if (seconds === 0) return `${minutes} min`;
  return `${minutes} min ${seconds} s`;
}

export const STATUS_LABELS = {
  idle: 'Listo para iniciar',
  running: 'En curso',
  paused: 'En pausa',
  finished: 'Tiempo finalizado',
};
