import { useEffect, useState } from 'react';

/**
 * Repinta a un máximo de `fps` fotogramas por segundo mientras `active` sea true.
 * Devuelve un timestamp de performance.now() para interpolar el cronómetro.
 */
export function useTicker(active = true, fps = 30) {
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (!active) return undefined;

    let frame = 0;
    let last = 0;
    const step = 1000 / fps;

    const loop = (time) => {
      if (time - last >= step) {
        last = time;
        setNow(time);
      }
      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [active, fps]);

  return now;
}

/** Reloj simple que se actualiza cada `intervalMs`. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
