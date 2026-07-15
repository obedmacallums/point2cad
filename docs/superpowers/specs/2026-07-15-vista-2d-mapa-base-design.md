# Diseño: Vista 2D con mapa base (Leaflet)

> Fecha: 2026-07-15
> Estado: aprobado (brainstorming) — pendiente de plan de implementación.

## 1. Objetivo

Añadir a la etapa de visualización una **vista 2D sobre mapa base**
(OpenStreetMap / imágenes satelitales) que muestre los puntos, líneas y
polilíneas cerradas ya procesados, con los mismos colores de la biblioteca de
características. Es la verificación visual más rápida para el usuario
topógrafo: "¿los puntos caen donde levanté?".

La etapa pasa a llamarse **"Vista"** (hoy "Vista 3D") y ofrece alternancia
3D ⇄ Mapa cuando el CRS de origen es resoluble.

## 2. Alcance

**Dentro (MVP):**

- Renombrar la etapa `visualize` de "Vista 3D" a "Vista" (solo la etiqueta;
  el id `visualize` y el modo `viewer` no cambian).
- Control segmentado "3D | Mapa" en la pantalla de visualización.
- Vista de mapa con Leaflet: capa base OSM + capa satelital Esri World
  Imagery, alternables con el control de capas nativo de Leaflet.
- Geometrías (puntos → `CircleMarker`, líneas → `Polyline`, polilíneas
  cerradas → `Polygon`) estiladas con el color de `featureLibrary`,
  respetando la visibilidad por código (`visible !== false`, mismo criterio
  que `ExportPanel`).
- Popup por entidad: nombre (puntos), código, capa y coordenadas UTM
  originales.
- `fitBounds` automático al abrir el mapa con un dataset nuevo.
- Gate por CRS: el segmento "Mapa" se deshabilita (con motivo visible)
  cuando el CRS no es resoluble.
- Aviso no bloqueante si los tiles no cargan (sin conexión).

**Fuera (fases futuras, YAGNI ahora):**

- Sincronización de selección mapa ↔ tabla ↔ 3D.
- Herramienta de medición en el mapa (el 3D ya tiene la suya).
- Clustering de puntos, captura PNG del mapa.
- Persistencia del modo de vista (`3d`/`map`) en la sesión guardada.
- Reproyección a CRS de salida arbitrarios (idea aparte del backlog).

## 3. Enfoques considerados

**A (aprobado): Leaflet + reproyección en JS reutilizando `geoConvert.js`.**
La geometría en memoria (`state.points/lines/polylines`) está siempre en UTM
plano; `reprojectGeometryToWGS84(geometry, zone, hemisphere)` ya existe y ya
la usa el export KML/GeoJSON. El mapa se alimenta 100 % en JS, sin tocar
Python ni Pyodide. Mínimas piezas nuevas, máxima reutilización.

**B (descartado): MapLibre GL.** WebGL y tiles vectoriales; brilla con
decenas de miles de features, pero un levantamiento típico son cientos a
pocos miles de puntos. Bundle ~250 KB extra y más complejidad sin beneficio
para este caso. El renderer canvas de Leaflet es suficiente.

**C (descartado): generar un GeoJSON WGS84 desde Python y pintarlo.** Añade
un viaje a Pyodide y un formato intermedio que no aporta nada: los datos y la
reproyección ya están disponibles en JS.

## 4. Diseño

### 4.1 Condición de activación (gate CRS)

Mismo criterio que los formatos WGS84 del `ExportPanel`:

```js
const zoneInfo = resolveZone(
  state.rawCSVRows, state.columnMapping, state.parseOptions, state.disabledRows,
)
// zoneInfo === null  → segmento "Mapa" deshabilitado
// zoneInfo = { zone, hemisphere, epsg } → mapa disponible
```

- Segmento "Mapa" deshabilitado con `title`/tooltip: **"Requiere CRS —
  decláralo en Importar CSV"** (mismo lenguaje que el ExportPanel).
- Si el usuario está en modo mapa y el CRS deja de ser resoluble (p. ej.
  carga otro CSV sin CRS), **fallback automático a 3D** — mismo patrón del
  `useEffect` de `ExportPanel` que vuelve a DXF.

### 4.2 Estructura de componentes

```
App.jsx (case 'viewer')
└── ViewerStage (nuevo)  src/components/ViewerStage/ViewerStage.jsx
    ├── control segmentado "3D | Mapa" (overlay fijo, centrado en el borde superior)
    ├── <Viewer3D />   (existente, sin cambios)
    └── <MapView />    (nuevo)  src/components/MapView/MapView.jsx
```

- `App.jsx` cambia `case 'viewer': return <Viewer3D />` por
  `return <ViewerStage />`.
- `ViewerStage` mantiene **ambas vistas montadas** y alterna con la clase
  `hidden`: la cámara 3D no se resetea al ir y volver, y Leaflet no repite
  fit-bounds ni recarga de tiles. `MapView` solo se monta la primera vez que
  el usuario entra al modo mapa (montaje perezoso), y a partir de ahí queda
  montado.
- Estado local en `ViewerStage`: `viewMode: '3d' | 'map'`, inicial `'3d'`.
  No va al `AppContext` ni a `sessionStorage` en el MVP.
- Al mostrar el mapa: llamar `map.invalidateSize()` (Leaflet calcula mal el
  tamaño si se inicializó oculto o cambió el layout).

### 4.3 Renombre de la etapa

`src/hooks/useStageNavigation.js`: `{ id: 'visualize', label: 'Vista 3D' }`
→ `label: 'Vista'`. Nada más cambia (ids, modos, sesiones y navegación
intactos). Revisar textos de UI que digan "Ver en 3D" (botón de
`ResultsPanel`): se mantiene, porque ese botón lleva a la etapa cuya vista
inicial es 3D.

### 4.4 Flujo de datos de MapView

```
state.points / state.lines / state.polylines   (UTM, en memoria)
        + state.featureLibrary (color, capa, visible)
        + zoneInfo (zone, hemisphere)
        ↓  useMemo
reprojectGeometryToWGS84(...)   ← ya existe en src/utils/geoConvert.js
        ↓
Capas Leaflet:
  puntos              → CircleMarker (radio pequeño, color del código)
  líneas              → Polyline
  polilíneas cerradas → Polygon (relleno con opacidad baja, borde sólido)
```

- Mapa creado con `preferCanvas: true` (miles de CircleMarkers sin coste).
- Se excluyen los códigos con `visible === false` en `featureLibrary`
  (mismo `isCodeVisible` que usa el ExportPanel en modo viewer).
- Popups: puntos → `nombre`, `codigo`, `capa`, `x/y/z` UTM originales;
  líneas/polilíneas → `codigo`, `capa`, nº de vértices.
- La Z se ignora en el mapa (Leaflet es 2D); no hay pérdida porque la vista
  es solo de verificación planimétrica.

### 4.5 Capas base (tiles)

| Capa | URL | Atribución |
|---|---|---|
| OSM (defecto) | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | © OpenStreetMap contributors |
| Satélite | Esri World Imagery (`server.arcgisonline.com/.../World_Imagery/...`) | Esri, Maxar, Earthstar Geographics |

- Sin API keys ni backend, consistente con la filosofía del proyecto.
- Control de capas nativo de Leaflet (`L.control.layers` /
  `<LayersControl>`) para alternar.
- Error de tiles (sin conexión): escuchar `tileerror` y mostrar un banner
  discreto "Sin conexión: no se puede cargar el mapa base". Las geometrías
  siguen visibles sobre el fondo gris.

### 4.6 Dependencias y estilos

- `leaflet@^1.9` y `react-leaflet@^4.2`. **No usar react-leaflet v5**: exige
  React 19 y el proyecto usa React 18.3.
- Importar `leaflet/dist/leaflet.css` en `MapView`.
- Los panes internos de Leaflet usan z-index 200–700: envolver el mapa en un
  contenedor con `relative z-0`/`isolation: isolate` para crear un stacking
  context propio y que no tape el drawer (`z-50`) ni los modales.
- Tema: el contenedor del mapa hereda el fondo `bg-gray-950`; los tiles OSM
  son claros — aceptable para el MVP (el mapa es una vista de verificación,
  no se tematiza en oscuro).

### 4.7 fitBounds

- Al montar `MapView` por primera vez: `fitBounds` sobre la extensión de
  todas las geometrías reproyectadas (con un padding pequeño).
- Se vuelve a hacer fit solo cuando cambia el dataset (cambio de
  `state.fileName` o del conteo de entidades), no en cada alternancia
  3D ⇄ Mapa ni al tocar visibilidades.

## 5. Manejo de errores

| Situación | Comportamiento |
|---|---|
| CRS no resoluble | Segmento "Mapa" deshabilitado con motivo; nunca un mapa mal georreferenciado en silencio (mismo principio que exportes WGS84) |
| CRS deja de ser resoluble estando en mapa | Fallback automático a 3D |
| Sin conexión / tiles fallan | Banner discreto; geometrías visibles sobre fondo gris |
| Dataset vacío | El modo viewer ya exige geometría; sin caso especial |

## 6. Testing

Seguir los patrones existentes (Vitest + Testing Library, tests junto al
componente):

- `ViewerStage.test.jsx`: renderiza 3D por defecto; segmento "Mapa"
  deshabilitado sin CRS (con el motivo en `title`); habilitado con CRS;
  alterna a mapa; fallback a 3D cuando el CRS desaparece.
- `MapView.test.jsx`: con react-leaflet mockeado, verifica que se generan
  las capas correctas por tipo de entidad, que se excluyen códigos con
  `visible === false` y que los colores salen de `featureLibrary`.
- La reproyección no necesita tests nuevos: `reprojectGeometryToWGS84` ya
  está cubierta en `geoConvert.test.js`.

## 7. Criterios de aceptación

1. La etapa del stepper dice "Vista" (antes "Vista 3D") y todo el flujo
   existente funciona igual.
2. Con un CSV geodésico (p. ej. `docs/geodesic_test.csv`), el segmento
   "Mapa" está habilitado; al activarlo, los puntos caen en la ubicación
   real sobre OSM/satélite con los colores de la biblioteca.
3. Con un CSV plano y zona UTM declarada al importar, el mapa también
   funciona (reproyección inversa correcta).
4. Con un CSV plano sin CRS, "Mapa" aparece deshabilitado con el motivo
   visible, y la vista 3D funciona como siempre.
5. Alternar 3D ⇄ Mapa no resetea la cámara 3D ni re-encuadra el mapa.
6. Ocultar un código en la biblioteca lo oculta también en el mapa.
7. `npm test` y `npm run build` pasan; el visor 3D no sufre regresiones.
