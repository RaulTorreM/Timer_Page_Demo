import { useEffect, useRef, useState } from 'react';

const COVER_MS = 520;
const REVEAL_MS = 860;

/**
 * Cambia el contenido del escenario detrás de una cortina.
 * `phase` alimenta las clases .is-covering / .is-revealing de la pantalla.
 */
export function useStageTransition(target) {
  const [displayed, setDisplayed] = useState(target);
  const [phase, setPhase] = useState('idle');
  const timers = useRef([]);
  const targetRef = useRef(target);
  const displayedRef = useRef(target);
  const mounted = useRef(false);

  displayedRef.current = displayed;

  useEffect(() => {
    targetRef.current = target;

    if (!mounted.current) {
      mounted.current = true;
      displayedRef.current = target;
      setDisplayed(target);
      return;
    }

    if (target === displayedRef.current && phase === 'idle') return;

    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase('cover');

    timers.current.push(
      setTimeout(() => {
        displayedRef.current = targetRef.current;
        setDisplayed(targetRef.current);
        setPhase('reveal');
        timers.current.push(
          setTimeout(() => setPhase('idle'), REVEAL_MS + 40),
        );
      }, COVER_MS),
    );
    // `phase` se lee solo para salir temprano cuando ya está estable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return { displayed, phase };
}
