# Debate Timer · CCH

Cronómetro en vivo para un evento de debate, con **tres pantallas**:

| Pantalla | URL | Uso |
| --- | --- | --- |
| Timer | `/timer` | Se proyecta al público. Muestra la cuenta regresiva, alerta roja en los últimos segundos y el flyer al finalizar. |
| Control | `/control` | Panel del operador. Configura el tiempo, inicia/pausa, reinicia, cambia al flyer, sube el flyer y reproduce audio. |
| Logos | `/logos` | Pared de instituciones sobre papel, sin controles. |

Todo se sincroniza **en tiempo real** por WebSocket (Socket.IO): lo que haces en el panel se refleja en el proyector sin recargar la página, incluso si están en equipos distintos de la misma red.

---

## 1. Puesta en marcha

Requisitos: Node.js 18 o superior.

```bash
npm install
npm run build
npm start
```

Luego abre:

- Timer: <http://localhost:4000/timer>
- Control: <http://localhost:4000/control>
- Logos: <http://localhost:4000/logos>

`npm run serve` hace el build y arranca el servidor en un solo paso.

### Modo desarrollo

```bash
npm run dev
```

- Panel: <http://localhost:5173/control>
- Timer: <http://localhost:5173/timer>

Vite reenvía `/api`, `/uploads` y `/socket.io` al servidor de la API (puerto 4000).

---

## 2. Cómo se usa el día del evento

1. Abre `/control` en la laptop del operador.
2. Define la **etiqueta** (“Tiempo de participación”, “Inicia en”, etc.), la **duración** y los **segundos de alerta**.
3. Pulsa **Guardar cambios**. La pantalla del timer se actualiza al instante.
4. En la computadora del proyector abre `/timer` y pulsa **F** para pantalla completa.
5. Usa **Iniciar / Pausar / Reanudar** y **Reiniciar** desde el panel. Estos controles se aplican de inmediato, sin guardar.
6. Al terminar, el flyer aparece automáticamente (si está activado) o pulsa **Mostrar flyer**.

> El botón **Guardar cambios** solo se usa para la configuración (tiempo, etiqueta, alerta, flyer automático). Los botones de reproducción son acciones inmediatas; la barra inferior “Guardar y confirmar” aparece cuando hay cambios pendientes.

### Atajos del panel

| Tecla | Acción |
| --- | --- |
| `Espacio` | Iniciar / pausar |
| `R` | Reiniciar el cronómetro |
| `F` | Alternar timer ↔ flyer |

### Atajos del timer

| Tecla | Acción |
| --- | --- |
| `F` | Entrar / salir de pantalla completa |

También puedes entrar con el botón **Pantalla completa** de la esquina inferior izquierda. Al estar en pantalla completa, el botón se reduce a un icono discreto en esa misma esquina para salir; también puedes usar `F` o `Esc`.

El cursor se oculta solo después de unos segundos de inactividad en la pantalla del timer.

---

## 3. Flyer

Dos formas de cargarlo:

- **Desde el panel**: sección “Flyer del debate” → *Subir imagen* (PNG, JPG, WEBP, GIF o AVIF, hasta 20 MB). Se guarda en `server/uploads/` y se sincroniza en todas las pantallas.
- **Archivo local**: copia tu imagen a `client/public/flyer.jpg` y en el panel escribe `/flyer.jpg` → *Aplicar*. Recuerda ejecutar `npm run build` otra vez si usas esta opción.

También acepta una URL externa `https://...`.

Al finalizar el tiempo:

- Con **“Mostrar al terminar”** activo, la pantalla muestra unos segundos el tiempo cumplido y luego **una cortina de tinta barre la pantalla** y descubre el flyer con un asentamiento suave.
- Sin esa opción, se queda en `00:00` hasta que pulses *Mostrar flyer*.

La transición también se usa al cambiar manualmente entre timer y flyer, y al volver.

---

## 4. Audio

El panel también funciona como reproductor de audio, con subida y control desde la misma hoja.

- **Subir:** MP3, M4A, MP4 (aunque sea un video, se reproduce su audio), WAV, OGG o AAC, hasta 100 MB. El archivo se guarda en `server/uploads/` y el panel recuerda cuál está seleccionado.
- **Reproducir / pausar:** botón principal del reproductor. También hay **−10 s**, **+10 s** y **Reiniciar**.
- **Cambiar dónde empieza:** arrastra la barra de progreso o escribe un tiempo exacto en **“Iniciar en”** (`0:30`, `1:15` o `90` segundos) y pulsa **Ir**. Al pulsar reproducir, empieza desde ahí.
- **Dónde suena:** se reproduce en el equipo donde está abierto el panel de control, no en la pantalla del timer. Conecta la salida de audio de ese equipo a la mesa de sonido. Si necesitas que suene desde el equipo de proyección, se puede mover a esa pantalla.
- La reproducción es local: si recargas el panel, vuelve a pulsar reproducir. El archivo seleccionado sí queda guardado.

## 5. Personalizar el evento

Los textos de marca están en un solo archivo:

`client/src/config.js`

```js
export const EVENT = {
  name: 'Debate Oficial',
  kicker: 'Cronómetro de sala',
  hint: 'F — Pantalla completa',
};
```

La paleta y los tipos están centralizados en variables CSS al inicio de:

- `client/src/styles/global.css` (materiales y colores)
- `client/src/styles/timer.css` (escenario)
- `client/src/styles/control.css` (mesa de control)

La tipografía **Schibsted Grotesk** se sirve desde el propio proyecto (paquete `@fontsource-variable/schibsted-grotesk`): no depende de internet durante el evento.

---

## 6. Usar en dos computadoras (proyector + control)

1. Conecta ambas al mismo router.
2. En la laptop del operador, averigua la IP local:
   ```powershell
   ipconfig
   ```
   Usa la IPv4, por ejemplo `192.168.1.45`.
3. Abre en el proyector: `http://192.168.1.45:4000/timer`
   y en el operador: `http://192.168.1.45:4000/control`.
4. Si Windows bloquea la conexión, permite el puerto 4000 (PowerShell como administrador):
   ```powershell
   New-NetFirewallRule -DisplayName "Debate Timer" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow
   ```

No hace falta internet: solo red local. El servidor debe quedar encendido durante el evento.

> El panel no tiene contraseña. Úsalo en una red privada y no publiques el puerto a Internet.

---

## 7. Persistencia y recuperación

- El estado se guarda en `server/data/state.json` (se crea solo).
- Si el servidor se reinicia, recupera la configuración y el flyer; si el cronómetro estaba corriendo, calcula el tiempo real transcurrido y termina cuando corresponde.
- Las pantallas se reconectan solas y muestran “Reconectando…” si pierden la conexión. Al volver, recuperan el estado sin refrescar.

---

## 8. Estructura

```
debate-timer-cch/
├── client/                 React 19 + Vite + React Router
│   ├── public/             Archivos estáticos opcionales (ej. flyer.jpg)
│   └── src/
│       ├── pages/          TimerPage.jsx · ControlPage.jsx · LogosPage.jsx
│       ├── components/     FlyerLayer · AudioPanel · LivePreview
│       ├── hooks/          useDebateState · useTicker · useStageTransition
│       ├── lib/            socket.js · time.js
│       ├── styles/         global.css · timer.css · control.css · logos.css
│       ├── logos.js        Instituciones de la pared de logos
│       └── config.js       Textos del evento
├── server/                 Express + Socket.IO
│   ├── src/index.js        API, uploads y eventos en tiempo real
│   ├── src/store.js        Estado autoritativo y persistencia
│   ├── data/               state.json (generado)
│   └── uploads/            Flyers y audios subidos
└── package.json            Scripts raíz (workspaces)
```

Los logos de la pared institucional viven en `client/public/logos/`.

---

## 9. Página de instituciones

`/logos` es una pared con las cuatro instituciones, sin controles ni texto visible: solo las marcas, la piedra y la luz.

- Ya están integrados los cuatro logos en `client/public/logos/`:
  - Cámara de Comercio y Producción de Huancayo.
  - Colegio de Periodistas del Perú — Filial Junín.
  - Competitividad Empresarial Junín, Perú.
  - 15-5 TV.
- Fondo de piedra cálida con anillos, retícula de puntos, una marca roja y marcas de registro en las esquinas.
- Las marcas flotan y respiran con duraciones distintas; el fondo tiene una luz que se desplaza lentamente.
- Los logos se recortaron y se les retiró el fondo; el de la Cámara conserva su anillo blanco.
- Para reemplazar un logo, sustituye el archivo en `client/public/logos/` o ajusta `name` y `src` en `client/src/logos.js`, y vuelve a compilar.
- Se abre desde el panel con “Abrir pared de instituciones” o directamente en `/logos`.
- En la esquina inferior izquierda hay un icono discreto para entrar o salir de pantalla completa; también funciona la tecla `F`.
- El cursor se oculta a los 3 segundos de inactividad.

## 10. Cómo funciona el tiempo

El servidor guarda `endsAt` (momento exacto de finalización). Cada pantalla recibe un snapshot con el tiempo restante y lo interpola localmente con `requestAnimationFrame`, por lo que el conteo se ve fluido entre actualizaciones. Cada 10 segundos el servidor reenvía el estado para corregir cualquier deriva.

Al entrar en los últimos segundos configurados (10 por defecto):

- todo el escenario se tiñe de un rojo vino profundo con un fundido,
- el número pasa a tinta cálida y cambia al formato de segundos gigantes con el rótulo **SEGUNDOS**,
- el número respira con un pulso que se acelera en los últimos 5 segundos.

Al cambiar entre timer y flyer, una cortina de tinta con filo de papel recorre la pantalla y descubre el contenido nuevo; no hay cambio seco de imagen.
