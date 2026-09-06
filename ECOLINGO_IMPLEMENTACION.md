# Informe de implementación — EcoLingo

## 1. Problemas encontrados

- El mapa no tenía una estrategia robusta para cambios de tamaño/orientación y podía volver a mover el viewport por actualizaciones de ubicación.
- Los puntos oficiales se consultaban en una sola lectura, sin paginación completa ni suscripción Realtime.
- La sincronización MMA borraba primero la tabla, de modo que una falla posterior podía dejar el sistema sin la última copia válida.
- Los puntos sin materiales informados podían terminar tratados como si aceptaran materiales no verificados.
- MobileNet/ImageNet se utilizaba como si fuera un clasificador de residuos y existía riesgo de clasificar entradas desconocidas en una categoría arbitraria.
- Buscador, escáner y EcoMascota no distinguían con suficiente claridad entre clasificación segura, ambigua y desconocida.
- El reconocimiento de voz podía finalizar sin transcripción y dejar la EcoMascota en un estado visual incoherente.
- Había dos estrategias PWA en paralelo: service worker manual y `vite-plugin-pwa`, además de referencias de iconos inconsistentes.
- Existía un servicio de Google Places sin integración fiable para materiales aceptados; fue retirado para no presentar inferencias como datos oficiales.

## 2. Archivos modificados

Principales cambios:

- `src/components/MapView.tsx`: mapa responsive, `ResizeObserver`, actualización incremental de capas, modo Canvas para volúmenes altos y botón de centrado explícito.
- `src/services/officialRecyclingPoints.ts`: paginación, deduplicación, cache local, frescura y Supabase Realtime.
- `seed_mma_chile.js`: sincronización segura, deduplicación por fuente, reintentos y limpieza de obsoletos sólo después de upserts correctos.
- `supabase/migrations/20260906_recycling_points_realtime.sql`: trazabilidad, índices, RLS, permisos y publicación Realtime.
- `src/data/recyclingData.ts`: clasificador compartido con estados `confident`, `uncertain` y `unknown`.
- `src/components/CameraScanner.tsx`: flujo de cámara/galería robusto, confianza conservadora, confirmación manual y evidencia de código de barras.
- `src/services/productBarcode.ts`: lectura opcional de `BarcodeDetector` + metadatos de envase de Open Food Facts.
- `src/components/EcoMascota.tsx` y `src/hooks/useSpeech.ts`: manejo de ambigüedad, voz y cleanup.
- `src/App.tsx`: integración del clasificador compartido, mapa y escáner corregidos.
- `vite.config.ts`, `src/main.tsx`, `index.html` y `public/*`: PWA unificada e iconos reales.
- `.github/workflows/sync-mma.yml`: sincronización programada del MMA con secretos de GitHub.
- `scripts/test-classifier.mjs`: pruebas de categorías y entradas ambiguas.

## 3. Escáner

MobileNet se conserva únicamente como señal auxiliar porque ImageNet no es un modelo especializado en residuos. La aplicación ahora:

- ignora etiquetas visuales que no tengan un mapeo explícito;
- usa la mejor probabilidad mapeable en vez de sumar probabilidades;
- devuelve estados confiable, incierto o desconocido;
- nunca usa una categoría por defecto para una predicción desconocida;
- exige confirmación en evidencia débil o conflictiva;
- permite seleccionar manualmente cualquiera de las nueve categorías;
- intenta complementar la visión con código de barras y metadatos de envase cuando el navegador y la base externa lo permiten;
- mantiene como inciertos los envases multimaterial;
- cierra los tracks de cámara y evita capturas concurrentes.

No se afirma que MobileNet alcance precisión especializada. Para ello sigue siendo necesario entrenar/evaluar un modelo específico de residuos con un dataset representativo.

## 4. EcoMascota

- Usa el mismo clasificador que el buscador.
- Las consultas ambiguas no generan instrucciones de una categoría inventada.
- Presenta alternativas para confirmación.
- Un escaneo sólo llega a EcoMascota después de la confirmación del usuario.
- Al cerrar se detienen síntesis y reconocimiento de voz.
- `no-speech`, `no-match`, errores de permisos y cierre sin transcripción vuelven a un estado válido en lugar de mantener “Escuchando…”.

## 5. Mapa

- El contenedor usa alturas adaptativas con `dvh` y reglas específicas para móvil/landscape.
- Leaflet recibe `invalidateSize()` mediante `ResizeObserver`, resize, orientación y visibilidad.
- El GPS actualiza el marcador del usuario pero no fuerza zoom continuamente.
- “Centrar en mí” mueve el mapa sólo cuando el usuario lo solicita.
- La tabla se descarga por páginas de 1000 registros hasta completarla.
- Supabase Realtime agrupa INSERT/UPDATE/DELETE en una recarga debounced.
- Se deduplican puntos por fuente/ID y, como defensa secundaria, por ubicación + nombre + dirección normalizados.
- Con muchos resultados se usan `CircleMarker` sobre Canvas para evitar cientos de iconos DOM.
- La lista se pagina visualmente de 50 en 50, mientras el mapa conserva todos los resultados filtrados.

## 6. PWA

Se eliminó el service worker manual y el manifest manual. `vite-plugin-pwa` es la única fuente de verdad y genera el service worker/manifest durante el build.

Iconos incluidos:

- `public/favicon.png` — 32×32
- `public/apple-touch-icon.png` — 180×180
- `public/pwa-192x192.png`
- `public/pwa-512x512.png`
- `public/pwa-maskable-512x512.png`

Workbox mantiene cache del app shell, tiles OSM, modelo TensorFlow, fuentes y consultas recientes de metadatos de productos.

## 7. Base de datos

Aplicar:

```text
supabase/migrations/20260906_recycling_points_realtime.sql
```

La migración añade `source`, `source_id`, `updated_at`, `last_verified_at` y `status`, crea un índice único `(source, source_id)` compatible con el `upsert` de Supabase, habilita lectura pública controlada por RLS y añade la tabla a Realtime.

La sincronización diaria incluida en GitHub Actions actualiza primero y retira registros MMA obsoletos sólo al finalizar los upserts. Si la API falla antes, la copia válida anterior no se borra.

## 8. Variables de entorno

Frontend público:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Backend/CI únicamente:

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`SUPABASE_SERVICE_ROLE_KEY` nunca debe llevar prefijo `VITE_`.

## 9. Tests realizados

Ejecutado correctamente en este entorno:

- prueba unitaria del clasificador: **PASS** en los 11 casos conocidos exigidos;
- pruebas ambiguas: **PASS** en botella, caja, envase, bolsa, vaso, batería, bombilla, objeto, cosa y cadena vacía;
- transpilación sintáctica de todos los `.ts/.tsx`: **PASS**;
- `node --check` para scripts JS: **PASS**.

No fue posible completar `npm ci`, `npm run typecheck`, `npm run lint` y `npm run build` porque el registro `registry.npmjs.org` no estuvo accesible desde el entorno de ejecución (`EAI_AGAIN` / dependencia no presente en cache offline). Esto es un bloqueo de instalación del entorno, no se contabiliza como una validación aprobada. Al disponer de red, ejecutar los cuatro comandos indicados en README antes del despliegue.

## 10. Pendientes reales

- “Tiempo real” significa cambios de Supabase hacia clientes conectados. La fuente física del MMA sólo puede ser tan fresca como su última sincronización/publicación.
- Los horarios/estados se muestran únicamente cuando vienen informados; la app no inventa “abierto ahora”.
- Open Food Facts puede no tener datos de envase para todos los códigos de barras y `BarcodeDetector` no existe en todos los navegadores.
- La precisión visual especializada requiere un modelo de residuos propio o evaluado específicamente; MobileNet sigue siendo sólo una ayuda.
- La instalación Android/iOS, permisos de cámara/micrófono y Lighthouse deben probarse en dispositivos/navegadores reales después de un build de producción.
