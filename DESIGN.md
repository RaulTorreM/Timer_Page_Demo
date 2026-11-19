# Design

<!-- impeccable:design-schema 1 -->

## Idea

**Mesa de sala.** Dos materiales y una sola señal: la escena es tinta con tipografía de papel; la mesa de control es papel con tinta. El rojo aparece únicamente cuando el tiempo apremia o cuando hay algo que confirmar. La composición es de señalética y programa impreso, no de dashboard.

## Materiales y color

| Token | Valor | Uso |
| --- | --- | --- |
| `--ink` | `#12100C` | Fondo del escenario, barra de guardado. |
| `--ink-soft` | `#1B1813` | Cortina, superficies sobre tinta. |
| `--bone` | `#F6F1E7` | Números y texto sobre tinta. |
| `--paper` | `#F2EDE3` | Fondo de la mesa de control. |
| `--paper-deep` | `#E6DFD1` | Rellenos discretos (miniatura, código). |
| `--signal` | `#D01E2A` | Marca, foco, confirmación, acentos pequeños. |
| `--alert` | `#8F1521` | Centro del campo de alerta. |
| `--alert-mid` | `#76101A` | Medio del degradado de alerta. |
| `--alert-deep` | `#590911` | Bordes del campo de alerta. |
| `--alert-ink` | `#F0E5D5` | Números y texto sobre el campo de alerta. |
| `--text` | `#14120E` | Tinta sobre papel. |
| `--muted` | `#5F5A50` | Texto secundario sobre papel. |
| `--stage-muted` | `rgba(246,241,231,.6)` | Texto secundario sobre tinta. |

- Grano de película sutil sobre ambos fondos (`--grain`), sin degradados decorativos ni glassmorphism.
- El rojo nunca es decoración: marca de evento, foco, estado sin guardar y acción primaria de confirmación. En alerta, el escenario usa un rojo vino profundo (`--alert`) con viñeta y tinta cálida, pensado para no deslumbrar en una sala a oscuras.
- Bordes: 2 px de tinta para separar secciones; 1 px o punteado para datos y formularios.

## Tipografía

- **Schibsted Grotesk Variable**, autoalojada. Es la única familia: la jerarquía se construye con tamaño, peso y ancho de tracking.
- Números: peso 800, `letter-spacing` −0.03 a −0.05 em, `tabular-nums`. El número es el protagonista absoluto del escenario.
- Micro-rótulos: mayúsculas, peso 650–750, tracking 0.14–0.28 em, tamaño 9.5–13 px en el panel.
- Escala de panel: h1 `clamp(42px, 6vw, 72px)`, h2 20 px, cuerpo 12–13.5 px, ayudas 11.5 px.
- Sin serif, sin cursivas decorativas, sin tipografías mono como disfraz técnico.

## Composición

### Escenario (`/timer`)

- Rail superior con marca + título + estado; rail inferior con pista de pantalla completa y hora de 24 h.
- Centro: rótulo pequeño, número gigante (`26vmin` en formato reloj, `36vmin` en segundos), nota de estado.
- Sin anillos, sin tarjetas, sin viñetas de iconos, sin bordes redondeados.
- En alerta: el campo entero pasa a un rojo vino profundo y el número a tinta cálida; el formato cambia a segundos con el rótulo **SEGUNDOS** flanqueado por líneas finas.
- Flyer: la imagen se contiene a pantalla completa sobre tinta, con un asentamiento lento de escala (1.05 → 1).

### Mesa de control (`/control`)

- Hoja impresa: masthead con filete de 2 px, titular enorme, ficha de fecha, secciones separadas por filetes.
- Sin tarjetas: los bloques son secciones de una misma hoja. El único objeto sólido es el **monitor** de tinta con la proyección y el transporte.
- Datos en líneas de puntos (`.ledger`), formularios con subrayado, presets en sellos rectangulares.
- El campo de duración es un componedor tipográfico: dos cifras grandes separadas por dos puntos.

### Audio

- El panel **no reproduce**: envía play, pausa y posición por WebSocket, y el audio suena en `/timer`.
- La posición vive en el servidor (base + instante de inicio) y se interpola en ambas pantallas; la barra del panel y el audio real se corrigen mutuamente.
- Si el navegador bloquea el autoplay, el timer muestra un aviso discreto **Activar audio**; un gesto allí habilita el control remoto.
- La vista previa del panel carga el timer con `?preview=1` y no monta el audio: una sola salida de sonido.

## Movimiento

- **Un solo momento autoral:** la cortina. Al cambiar de vista, un plano de tinta con filo de papel (3 px `--bone`) sube, cubre y sigue de largo para descubrir el contenido; 520 ms de cobertura + 860 ms de revelado, `cubic-bezier(.65,0,.35,1)`.
- Alerta: fundido del campo a rojo (550 ms) y respiración del número (1 s, 0.66 s en los últimos 5 s).
- Cambio de formato reloj → segundos: entrada del número con desenfoque y desplazamiento (440 ms).
- Interfaz: transiciones de 160–300 ms; nunca rebotes ni animaciones simultáneas sin jerarquía.
- `prefers-reduced-motion` desactiva pulsos, cortina y entradas.

## Componentes

- **Botón sólido:** rectángulo de tinta, texto papel, mayúsculas 10.5 px; hover rojo. Radio 2 px.
- **Botón de línea:** filete de 1 px; hover invierte a tinta.
- **Botón de texto:** subrayado de 1 px con offset 5 px.
- **Campos:** sin caja; solo filete inferior de 2 px que pasa a rojo al enfocar.
- **Casilla:** cuadrado de 18 px con borde de 1.5 px; marcada en rojo con check dibujado.
- **Monitor:** bloque de tinta con pantalla 16:9, tiempo grande, barra de 2 px, transporte y conmutador Timer/Flyer.
- **Barra de guardado:** fija, tinta, filete superior rojo de 2 px, aparece solo con cambios pendientes.
- **Avisos:** papel con filete, cuadrado rojo; sin sombras difusas ni radios.

## Voz

Español directo, de mesa de producción: “Guardar cambios”, “Cambios sin guardar”, “Últimos segundos”. Sin signos de admiración ni promesas. Las etiquetas nombran la acción o el dato.

## Pared de instituciones (`/logos`)

- Sin texto visible: solo cuatro marcas sobre un campo de piedra cálida (`#E5DCCB` al centro, `#ADA08A` en los bordes).
- Diseño de fondo: retícula de puntos, dos anillos concéntricos, una barra roja al borde izquierdo, marcas de registro en las esquinas y una luz cálida que deriva lentamente.
- Los logos van recortados, con fondo transparente y sombra propia (`drop-shadow`), de modo que se separan del campo sin placas ni tarjetas.
- Movimiento: flotación de `1.15vh` con escala `1.026` y una inclinación mínima, en duraciones de 12–16,5 s; cada logo tiene un halo que respira en contrafase. El cursor se oculta a los 3 s.
- Sin controles ni interacción: es una pantalla de fondo.

## Accesibilidad

- Contraste AA en texto del panel; texto de escenario a 60 % de hueso sobre tinta supera 4.5:1.
- El estado nunca depende solo del color: se escribe “En pausa”, “Últimos segundos”, “Sin señal”.
- Foco visible de 2 px con offset en todos los controles; atajos documentados en la interfaz.
- Números con `tabular-nums` para evitar saltos de composición.
