import { io } from 'socket.io-client';

export const socket = io({
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 400,
  reconnectionDelayMax: 2500,
});

/** Envía un evento al servidor y espera confirmación (ack). */
export function request(event, payload = {}) {
  return new Promise((resolve) => {
    if (!socket.connected) {
      resolve({ ok: false, error: 'Sin conexión con el servidor.' });
      return;
    }
    socket.timeout(6000).emit(event, payload, (timeoutError, response) => {
      if (timeoutError) {
        resolve({ ok: false, error: 'El servidor no respondió. Intenta otra vez.' });
        return;
      }
      resolve(response ?? { ok: false, error: 'Respuesta inválida del servidor.' });
    });
  });
}
