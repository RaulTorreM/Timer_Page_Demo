import { useEffect, useState } from 'react';
import { useFullscreen } from '../hooks/useFullscreen.js';
import { INSTITUTIONS } from '../logos.js';
import '../styles/logos.css';

export default function LogosPage() {
  const [cursorIdle, setCursorIdle] = useState(false);
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  useEffect(() => {
    let timer = setTimeout(() => setCursorIdle(true), 3000);
    const wake = () => {
      setCursorIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setCursorIdle(true), 3000);
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

  return (
    <div className={`logos-page ${cursorIdle ? 'hide-cursor' : ''}`}>
      <div className="logos-scene" aria-hidden="true">
        <span className="scene-dots" />
        <span className="scene-ring" />
        <span className="scene-ring is-dashed" />
        <span className="scene-bar" />
        <span className="scene-light" />
        <span className="scene-corner is-tl" />
        <span className="scene-corner is-tr" />
        <span className="scene-corner is-bl" />
        <span className="scene-corner is-br" />
        <span className="grain" />
      </div>

      <h1 className="sr-only">Instituciones participantes</h1>

      <ul className="logos-wall">
        {INSTITUTIONS.map((institution, index) => (
          <li className="logo-slot" key={institution.id} style={{ '--slot': index }}>
            <span className="logo-halo" aria-hidden="true" />
            <div className="logo-media">
              {institution.src ? (
                <img
                  src={institution.src}
                  alt={institution.name}
                  draggable="false"
                  decoding="async"
                />
              ) : (
                <span className="logo-empty" aria-hidden="true" />
              )}
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="logos-fs"
        onClick={toggleFullscreen}
        title={
          isFullscreen ? 'Salir de pantalla completa (F o Esc)' : 'Pantalla completa (F)'
        }
        aria-label={
          isFullscreen
            ? 'Salir de pantalla completa'
            : 'Poner la pantalla en pantalla completa'
        }
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path
            d={
              isFullscreen
                ? 'M7 2v5H2M9 2v5h5M7 14v-5H2M9 14v-5h5'
                : 'M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4'
            }
          />
        </svg>
      </button>
    </div>
  );
}
