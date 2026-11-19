# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Operador del evento:** una persona de la organización, frente a una laptop, ajusta el cronómetro durante un debate en vivo. Necesita entender el estado y actuar en segundos, sin margen de error.
- **Público y participantes:** miran una pantalla proyectada a distancia en un auditorio con poca luz. Necesitan leer el tiempo restante de un vistazo.

## Product Purpose

Proyectar un cronómetro de debate legible, sereno y contundente, y permitir que una sola persona lo gobierne en tiempo real desde otra pantalla, sin recargar ni interrumpir la proyección.

## Positioning

Dos superficies sincronizadas: la pantalla del escenario y la mesa de control. La configuración se confirma explícitamente; los controles de reproducción son inmediatos. El sistema tolera la caída de la red y la recarga del servidor sin perder el tiempo real.

## Operating Context

- Evento de debate presencial, con proyector o pantalla grande y una laptop de operación, normalmente en la misma red local.
- Se usa de pie, con prisa, entre intervenciones; el operador puede estar viendo el escenario mientras opera.
- El flyer del evento se entrega después y se proyecta al terminar el tiempo.
- La sala está a oscuras; el panel se usa en luz ambiente.

## Capabilities and Constraints

- Cronómetro con duración configurable, pausa, reanudación, reinicio y suma de tiempo.
- Alerta visual en los últimos N segundos (10 por defecto) y cambio de formato a segundos.
- Cambio entre cronómetro y flyer, con transición animada; el flyer puede subirse o referenciarse por URL.
- Sincronización por WebSocket, persistencia del estado y recuperación tras reinicio.
- Atajos de teclado para operar sin ratón.
- Sin autenticación; pensado para una red privada.

## Brand Commitments

- El nombre y la identidad del evento son editables en `client/src/config.js`; no inventar patrocinadores, sedes ni fechas.
- La pantalla del escenario conserva título, hora y la indicación de pantalla completa.
- Referencia vinculante del usuario: pantalla roja saturada, número blanco gigante y rótulo «SEGUNDOS»; el resultado debe ser más limpio y menos genérico que la versión anterior, sin anillos, neones ni tarjetas de vidrio.

## Evidence on Hand

- No hay flyer definitivo todavía; se usa una imagen de prueba solo para validar la transición.
- El proyecto arranca sin datos reales del evento (fecha, sede, participantes).

## Product Principles

1. El tiempo se lee antes que nada: jerarquía tipográfica por encima de la decoración.
2. La operación nunca depende de un solo control ni de una recarga.
3. Confirmar configuración, ejecutar reproducción: dos ritmos distintos y visibles.
4. El silencio visual es parte del diseño; el rojo aparece solo cuando significa algo.
5. Ensayar la caída: red, servidor y recarga no deben romper la función.

## Accessibility & Inclusion

- Legibilidad a distancia de proyector: cifras grandes, alto contraste, sin información solo por color.
- Respetar `prefers-reduced-motion` en las animaciones del escenario.
- Contraste mínimo AA en texto del panel y foco de teclado visible.
