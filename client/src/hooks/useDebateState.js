import { useEffect, useState } from 'react';
import { socket } from '../lib/socket';

/**
 * Estado compartido del evento, recibido por WebSocket.
 * `receivedAt` se guarda con performance.now() para interpolar el tiempo
 * restante en el cliente sin depender del reloj del sistema.
 */
export function useDebateState() {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(socket.connected);
  const [clients, setClients] = useState(0);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onState = (next) => setState({ ...next, receivedAt: performance.now() });
    const onClients = (count) => setClients(count);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state', onState);
    socket.on('clients', onClients);

    if (socket.connected) setConnected(true);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state', onState);
      socket.off('clients', onClients);
    };
  }, []);

  return { state, connected, clients };
}
