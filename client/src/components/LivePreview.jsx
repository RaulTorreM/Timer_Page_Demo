import { useEffect, useRef, useState } from 'react';

const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;

/** Vista en miniatura del timer real, escalada desde un lienzo de 1280×720. */
export default function LivePreview() {
  const boxRef = useRef(null);
  const [scale, setScale] = useState(0.34);

  useEffect(() => {
    const element = boxRef.current;
    if (!element) return undefined;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) setScale(width / BASE_WIDTH);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="preview" ref={boxRef}>
      <div
        className="preview-canvas"
        style={{ width: BASE_WIDTH, height: BASE_HEIGHT, transform: `scale(${scale})` }}
      >
        <iframe src="/timer" title="Vista previa del timer" tabIndex={-1} loading="lazy" />
      </div>
    </div>
  );
}
