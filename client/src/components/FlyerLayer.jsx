import { useEffect, useState } from 'react';

export default function FlyerLayer({ url }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [url]);

  if (!url || failed) {
    return (
      <div className="flyer-empty">
        <span className="mark" aria-hidden="true" />
        <p className="flyer-empty-title">{url ? 'No se pudo cargar el flyer' : 'Flyer pendiente'}</p>
        <p className="flyer-empty-note">
          {url
            ? 'Revisa la URL o vuelve a subir la imagen desde la mesa de control.'
            : 'Súbelo desde la mesa de control, sección Flyer.'}
        </p>
      </div>
    );
  }

  return (
    <figure className="flyer-frame">
      <img
        key={url}
        className="flyer-image"
        src={url}
        alt="Flyer del debate"
        onError={() => setFailed(true)}
      />
    </figure>
  );
}
