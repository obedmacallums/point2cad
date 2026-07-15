# Vista 2D con mapa base (Leaflet) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir a la etapa de visualización una vista 2D sobre mapa base (OSM / satélite Esri) con Leaflet, que pinte los puntos/líneas/polilíneas ya procesados con los colores de la biblioteca de características, y un control "3D | Mapa" para alternar.

**Architecture:** La geometría en memoria (`state.points/lines/polylines`) está en UTM plano. Un módulo puro (`mapLayers.js`) la reproyecta a WGS84 reutilizando `reprojectGeometryToWGS84` (el mismo que usa el export) y produce descriptores de capa. `MapView` los pinta con react-leaflet. `ViewerStage` envuelve `Viewer3D` + `MapView`, mantiene ambas montadas y alterna con la clase `hidden`. El gate por CRS reutiliza `resolveZone`, igual que `ExportPanel`.

**Tech Stack:** React 18.3, Vite, Vitest + Testing Library, `leaflet@^1.9`, `react-leaflet@^4.2`, `proj4` (ya presente).

## Global Constraints

- React 18.3 → usar `react-leaflet@^4.2` y `leaflet@^1.9`. **NO usar react-leaflet v5** (exige React 19).
- Todo en JS/cliente: no tocar Python ni Pyodide, sin API keys ni backend.
- Colores desde `state.featureLibrary[codigo].color`; excluir códigos con `visible === false` (criterio `featureLibrary[codigo]?.visible !== false`, idéntico al `ExportPanel`).
- Gate por CRS con `resolveZone(state.rawCSVRows, state.columnMapping, state.parseOptions, state.disabledRows)`: `null` ⇒ mapa no disponible; objeto `{ zone, hemisphere, epsg }` ⇒ disponible.
- Motivo del gate deshabilitado (texto literal): **"Requiere CRS — decláralo en Importar CSV"**.
- La Z se ignora en el mapa (Leaflet es 2D).
- UI y comentarios en español con acentos correctos. Tests junto al componente.
- El id de etapa `visualize` y el modo `viewer` NO cambian; solo cambia la etiqueta visible.

---

### Task 1: Renombrar la etapa "Vista 3D" → "Vista"

**Files:**
- Modify: `src/hooks/useStageNavigation.js:9`
- Modify: `src/components/ResumeSessionModal/ResumeSessionModal.jsx:10`
- Test: `src/hooks/useStageNavigation.test.js` (crear)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: constante exportada `STAGES` con la etapa `{ id: 'visualize', label: 'Vista' }` (sin cambios de firma).

- [ ] **Step 1: Escribir el test que falla**

Crear `src/hooks/useStageNavigation.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { STAGES } from './useStageNavigation'

describe('STAGES', () => {
  it('la etapa visualize se etiqueta "Vista" (sin "3D")', () => {
    const visualize = STAGES.find((s) => s.id === 'visualize')
    expect(visualize).toBeDefined()
    expect(visualize.label).toBe('Vista')
  })

  it('conserva los ids y el orden del flujo', () => {
    expect(STAGES.map((s) => s.id)).toEqual([
      'import', 'detect', 'process', 'visualize',
    ])
  })
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npm test -- src/hooks/useStageNavigation.test.js`
Expected: FAIL — `expected 'Vista 3D' to be 'Vista'`.

- [ ] **Step 3: Cambiar la etiqueta**

En `src/hooks/useStageNavigation.js` línea 9, reemplazar:

```js
  { id: 'visualize', label: 'Vista 3D' },
```

por:

```js
  { id: 'visualize', label: 'Vista' },
```

Y en `src/components/ResumeSessionModal/ResumeSessionModal.jsx` línea 10, reemplazar:

```js
  viewer: 'Vista 3D',
```

por:

```js
  viewer: 'Vista',
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `npm test -- src/hooks/useStageNavigation.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Confirmar que no queda ningún "Vista 3D" en el código**

Run: `grep -rn "Vista 3D" src/`
Expected: sin resultados.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useStageNavigation.js src/hooks/useStageNavigation.test.js src/components/ResumeSessionModal/ResumeSessionModal.jsx
git commit -m "feat(viewer): renombrar la etapa \"Vista 3D\" a \"Vista\""
```

---

### Task 2: Módulo puro `mapLayers.js` (descriptores de capas Leaflet)

**Files:**
- Create: `src/components/MapView/mapLayers.js`
- Test: `src/components/MapView/mapLayers.test.js`

**Interfaces:**
- Consumes: `reprojectGeometryToWGS84(geometry, zone, hemisphere)` de `src/utils/geoConvert.js`. La geometría de entrada tiene la forma `{ points: [{ x, y, z, codigo, nombre }], lines: [{ codigo, vertices: [[x,y,z],…] }], polylines: [{ codigo, vertices: [[x,y,z],…] }] }`. `featureLibrary` es `{ [codigo]: { color, capa, visible } }`. `zoneInfo` es `{ zone, hemisphere, epsg }` o `null`.
- Produces: `buildMapLayers(geometry, featureLibrary, zoneInfo)` → `{ points: [{ key, latlng: [lat,lng], color, popup }], lines: [{ key, latlngs: [[lat,lng],…], color, popup }], polygons: [{ key, latlngs, color, popup }], bounds: [[minLat,minLng],[maxLat,maxLng]] | null }`. Los popups de punto son `{ type: 'point', nombre, codigo, capa, x, y, z }`; los de línea/polígono `{ type: 'line'|'polygon', codigo, capa, vertices: <número> }`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/MapView/mapLayers.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildMapLayers } from './mapLayers'

// Zona 18 S (Chile). Coordenadas UTM plausibles cerca de Santiago.
const zoneInfo = { zone: 18, hemisphere: 'S', epsg: 32718 }

const geometry = {
  points: [
    { x: 345000, y: 6300000, z: 500, codigo: 'ARB', nombre: 'P1' },
    { x: 345010, y: 6300010, z: 501, codigo: 'OCULTO', nombre: 'P2' },
  ],
  lines: [
    { codigo: 'BORDE', vertices: [[345000, 6300000, 0], [345020, 6300020, 0]] },
  ],
  polylines: [
    { codigo: 'LOTE', vertices: [[345000, 6300000, 0], [345020, 6300000, 0], [345020, 6300020, 0]] },
  ],
}

const featureLibrary = {
  ARB: { color: '#22c55e', capa: 'ARBOLES', visible: true },
  OCULTO: { color: '#ef4444', capa: 'OCULTO', visible: false },
  BORDE: { color: '#3b82f6', capa: 'BORDES' },
  LOTE: { color: '#eab308', capa: 'LOTES' },
}

describe('buildMapLayers', () => {
  it('sin zoneInfo devuelve capas vacías y bounds null', () => {
    const r = buildMapLayers(geometry, featureLibrary, null)
    expect(r).toEqual({ points: [], lines: [], polygons: [], bounds: null })
  })

  it('genera una capa por tipo de entidad visible', () => {
    const r = buildMapLayers(geometry, featureLibrary, zoneInfo)
    expect(r.points).toHaveLength(1) // P2 excluido por visible:false
    expect(r.lines).toHaveLength(1)
    expect(r.polygons).toHaveLength(1)
  })

  it('excluye los códigos con visible === false', () => {
    const r = buildMapLayers(geometry, featureLibrary, zoneInfo)
    expect(r.points.map((p) => p.popup.codigo)).toEqual(['ARB'])
  })

  it('toma el color de featureLibrary', () => {
    const r = buildMapLayers(geometry, featureLibrary, zoneInfo)
    expect(r.points[0].color).toBe('#22c55e')
    expect(r.lines[0].color).toBe('#3b82f6')
    expect(r.polygons[0].color).toBe('#eab308')
  })

  it('usa un color de reserva cuando el código no está en la biblioteca', () => {
    const r = buildMapLayers(
      { points: [{ x: 345000, y: 6300000, z: 0, codigo: 'SIN', nombre: '' }], lines: [], polylines: [] },
      {},
      zoneInfo,
    )
    expect(r.points[0].color).toBe('#9ca3af')
  })

  it('el popup de punto conserva las coordenadas UTM originales', () => {
    const r = buildMapLayers(geometry, featureLibrary, zoneInfo)
    expect(r.points[0].popup).toMatchObject({
      type: 'point', nombre: 'P1', codigo: 'ARB', capa: 'ARBOLES',
      x: 345000, y: 6300000, z: 500,
    })
  })

  it('el popup de línea/polígono lleva el conteo de vértices', () => {
    const r = buildMapLayers(geometry, featureLibrary, zoneInfo)
    expect(r.lines[0].popup).toMatchObject({ type: 'line', codigo: 'BORDE', capa: 'BORDES', vertices: 2 })
    expect(r.polygons[0].popup).toMatchObject({ type: 'polygon', codigo: 'LOTE', capa: 'LOTES', vertices: 3 })
  })

  it('latlng de punto es [lat, lng] reproyectado al hemisferio sur', () => {
    const r = buildMapLayers(geometry, featureLibrary, zoneInfo)
    const [lat, lng] = r.points[0].latlng
    expect(lat).toBeLessThan(0)        // hemisferio sur
    expect(lat).toBeGreaterThan(-90)
    expect(lng).toBeGreaterThan(-180)
    expect(lng).toBeLessThan(0)        // longitud oeste
  })

  it('bounds cubre todas las geometrías visibles', () => {
    const r = buildMapLayers(geometry, featureLibrary, zoneInfo)
    expect(r.bounds).not.toBeNull()
    const [[minLat, minLng], [maxLat, maxLng]] = r.bounds
    expect(minLat).toBeLessThanOrEqual(maxLat)
    expect(minLng).toBeLessThanOrEqual(maxLng)
  })
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npm test -- src/components/MapView/mapLayers.test.js`
Expected: FAIL — no existe `./mapLayers`.

- [ ] **Step 3: Implementar el módulo**

Crear `src/components/MapView/mapLayers.js`:

```js
import { reprojectGeometryToWGS84 } from '../../utils/geoConvert'

// Color de reserva (gray-400) cuando un código no está en la biblioteca; evita
// marcadores invisibles ante datos inconsistentes.
const FALLBACK_COLOR = '#9ca3af'

const isVisible = (featureLibrary, codigo) =>
  featureLibrary[codigo]?.visible !== false

const colorFor = (featureLibrary, codigo) =>
  featureLibrary[codigo]?.color ?? FALLBACK_COLOR

const capaFor = (featureLibrary, codigo) =>
  featureLibrary[codigo]?.capa ?? codigo

// Transforma la geometría en memoria (UTM) en descriptores listos para Leaflet.
// Reproyecta a WGS84 con la misma función que el export, filtra por visibilidad
// y conserva las coordenadas UTM originales para los popups. Devuelve
// { points, lines, polygons, bounds } con latlng en orden [lat, lng]. bounds es
// [[minLat, minLng], [maxLat, maxLng]] o null si no hay geometría visible.
export function buildMapLayers(geometry, featureLibrary = {}, zoneInfo) {
  if (!zoneInfo) return { points: [], lines: [], polygons: [], bounds: null }

  const visP = (geometry.points ?? []).filter((p) => isVisible(featureLibrary, p.codigo))
  const visL = (geometry.lines ?? []).filter((l) => isVisible(featureLibrary, l.codigo))
  const visPl = (geometry.polylines ?? []).filter((pl) => isVisible(featureLibrary, pl.codigo))

  // reprojectGeometryToWGS84 devuelve puntos con x=lng, y=lat y vértices [lng, lat, z].
  const wgs = reprojectGeometryToWGS84(
    { points: visP, lines: visL, polylines: visPl },
    zoneInfo.zone,
    zoneInfo.hemisphere,
  )

  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity
  const track = (lat, lng) => {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
  }

  const points = wgs.points.map((rp, i) => {
    const orig = visP[i]
    track(rp.y, rp.x)
    return {
      key: `p${i}`,
      latlng: [rp.y, rp.x],
      color: colorFor(featureLibrary, orig.codigo),
      popup: {
        type: 'point',
        nombre: orig.nombre ?? '',
        codigo: orig.codigo,
        capa: capaFor(featureLibrary, orig.codigo),
        x: orig.x, y: orig.y, z: orig.z,
      },
    }
  })

  const toLatLngs = (verts) =>
    verts.map(([lng, lat]) => {
      track(lat, lng)
      return [lat, lng]
    })

  const lineDescriptor = (prefix, type) => (rl, i, orig) => ({
    key: `${prefix}${i}`,
    latlngs: toLatLngs(rl.vertices),
    color: colorFor(featureLibrary, orig.codigo),
    popup: {
      type,
      codigo: orig.codigo,
      capa: capaFor(featureLibrary, orig.codigo),
      vertices: orig.vertices.length,
    },
  })

  const makeLine = lineDescriptor('l', 'line')
  const makePolygon = lineDescriptor('pg', 'polygon')

  const lines = wgs.lines.map((rl, i) => makeLine(rl, i, visL[i]))
  const polygons = wgs.polylines.map((rpl, i) => makePolygon(rpl, i, visPl[i]))

  const bounds = Number.isFinite(minLat)
    ? [[minLat, minLng], [maxLat, maxLng]]
    : null

  return { points, lines, polygons, bounds }
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `npm test -- src/components/MapView/mapLayers.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/components/MapView/mapLayers.js src/components/MapView/mapLayers.test.js
git commit -m "feat(map): módulo puro buildMapLayers para descriptores Leaflet"
```

---

### Task 3: Componente `MapView` (render react-leaflet)

**Files:**
- Modify: `package.json` (nuevas dependencias)
- Create: `src/components/MapView/MapView.jsx`
- Test: `src/components/MapView/MapView.test.jsx`

**Interfaces:**
- Consumes: `buildMapLayers` (Task 2); `resolveZone` de `geoConvert`; `useApp()` de `AppContext` (devuelve `{ state }`).
- Produces: `export default function MapView({ active })`. `active` (bool, default `true`) indica si el mapa está visible; al pasar a `true` dispara `map.invalidateSize()`.

- [ ] **Step 1: Instalar dependencias**

Run: `npm install leaflet@^1.9 react-leaflet@^4.2`
Expected: se añaden a `dependencies` en `package.json`; el árbol resuelve sin advertencias de peer sobre React (react-leaflet 4 es compatible con React 18).

- [ ] **Step 2: Escribir el test que falla**

Crear `src/components/MapView/MapView.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import MapView from './MapView'
import { useApp } from '../../context/AppContext'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))

// react-leaflet mockeado: cada componente renderiza un marcador simple que
// expone el color por data-attr, para poder contar capas por tipo.
vi.mock('react-leaflet', () => {
  const Base = ({ children }) => <div>{children}</div>
  const LayersControl = ({ children }) => <div>{children}</div>
  LayersControl.BaseLayer = ({ children }) => <div>{children}</div>
  return {
    MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
    TileLayer: ({ url }) => <div data-testid="tile" data-url={url} />,
    LayersControl,
    CircleMarker: ({ children, pathOptions }) => (
      <div data-testid="circle" data-color={pathOptions.color}>{children}</div>
    ),
    Polyline: ({ children, pathOptions }) => (
      <div data-testid="polyline" data-color={pathOptions.color}>{children}</div>
    ),
    Polygon: ({ children, pathOptions }) => (
      <div data-testid="polygon" data-color={pathOptions.color}>{children}</div>
    ),
    Popup: Base,
    useMap: () => ({ invalidateSize: vi.fn(), fitBounds: vi.fn(), on: vi.fn(), off: vi.fn() }),
  }
})

// CSS de Leaflet: no aporta nada a los tests.
vi.mock('leaflet/dist/leaflet.css', () => ({}))

function mockState() {
  return {
    points: [
      { x: 345000, y: 6300000, z: 500, codigo: 'ARB', nombre: 'P1' },
      { x: 345010, y: 6300010, z: 501, codigo: 'OCULTO', nombre: 'P2' },
    ],
    lines: [{ codigo: 'BORDE', vertices: [[345000, 6300000, 0], [345020, 6300020, 0]] }],
    polylines: [{ codigo: 'LOTE', vertices: [[345000, 6300000, 0], [345020, 6300000, 0], [345020, 6300020, 0]] }],
    featureLibrary: {
      ARB: { color: '#22c55e', capa: 'ARBOLES', visible: true },
      OCULTO: { color: '#ef4444', capa: 'OCULTO', visible: false },
      BORDE: { color: '#3b82f6', capa: 'BORDES' },
      LOTE: { color: '#eab308', capa: 'LOTES' },
    },
    fileName: 'geodesic.csv',
    rawCSVRows: [],
    columnMapping: {},
    parseOptions: { coordSystem: 'projected', projectedCrs: 'utm', utmZone: '18', hemisphere: 'S' },
    disabledRows: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useApp.mockReturnValue({ state: mockState() })
})

describe('MapView', () => {
  it('renderiza las dos capas base (OSM y satélite)', () => {
    render(<MapView />)
    const urls = screen.getAllByTestId('tile').map((t) => t.getAttribute('data-url'))
    expect(urls.some((u) => u.includes('openstreetmap'))).toBe(true)
    expect(urls.some((u) => u.includes('arcgisonline'))).toBe(true)
  })

  it('genera una capa por tipo de entidad visible (excluye visible:false)', () => {
    render(<MapView />)
    expect(screen.getAllByTestId('circle')).toHaveLength(1) // OCULTO excluido
    expect(screen.getAllByTestId('polyline')).toHaveLength(1)
    expect(screen.getAllByTestId('polygon')).toHaveLength(1)
  })

  it('pinta cada entidad con el color de featureLibrary', () => {
    render(<MapView />)
    expect(screen.getByTestId('circle').getAttribute('data-color')).toBe('#22c55e')
    expect(screen.getByTestId('polyline').getAttribute('data-color')).toBe('#3b82f6')
    expect(screen.getByTestId('polygon').getAttribute('data-color')).toBe('#eab308')
  })
})
```

- [ ] **Step 3: Ejecutar el test y verificar que falla**

Run: `npm test -- src/components/MapView/MapView.test.jsx`
Expected: FAIL — no existe `./MapView`.

- [ ] **Step 4: Implementar el componente**

Crear `src/components/MapView/MapView.jsx`:

```jsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  LayersControl,
  CircleMarker,
  Polyline,
  Polygon,
  Popup,
  useMap,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useApp } from '../../context/AppContext'
import { resolveZone } from '../../utils/geoConvert'
import { buildMapLayers } from './mapLayers'

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTR = '© OpenStreetMap contributors'
const SAT_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const SAT_ATTR = 'Esri, Maxar, Earthstar Geographics'

// Controla el mapa desde dentro de MapContainer (donde useMap tiene contexto):
// corrige el tamaño al hacerse visible, encaja el dataset solo cuando cambia, y
// escucha errores de tiles para avisar sin bloquear.
function MapController({ bounds, datasetKey, active, onTileError }) {
  const map = useMap()

  // Leaflet calcula mal el tamaño si se montó oculto; al pasar a visible lo
  // recalculamos.
  useEffect(() => {
    if (active) map.invalidateSize()
  }, [active, map])

  // fitBounds solo cuando cambia el dataset, no en cada alternancia 3D⇄Mapa.
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [24, 24] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetKey])

  useEffect(() => {
    map.on('tileerror', onTileError)
    return () => map.off('tileerror', onTileError)
  }, [map, onTileError])

  return null
}

function PointPopupBody({ popup }) {
  return (
    <div className="text-xs leading-5">
      {popup.nombre ? <div><strong>{popup.nombre}</strong></div> : null}
      <div>Código: {popup.codigo}</div>
      <div>Capa: {popup.capa}</div>
      <div>X: {popup.x} · Y: {popup.y} · Z: {popup.z}</div>
    </div>
  )
}

function FeaturePopupBody({ popup }) {
  return (
    <div className="text-xs leading-5">
      <div>Código: {popup.codigo}</div>
      <div>Capa: {popup.capa}</div>
      <div>Vértices: {popup.vertices}</div>
    </div>
  )
}

export default function MapView({ active = true }) {
  const { state } = useApp()
  const [tileError, setTileError] = useState(false)
  const handleTileError = useCallback(() => setTileError(true), [])

  const zoneInfo = useMemo(
    () =>
      resolveZone(
        state.rawCSVRows,
        state.columnMapping,
        state.parseOptions,
        state.disabledRows,
      ),
    [state.rawCSVRows, state.columnMapping, state.parseOptions, state.disabledRows],
  )

  const layers = useMemo(
    () =>
      buildMapLayers(
        { points: state.points, lines: state.lines, polylines: state.polylines },
        state.featureLibrary,
        zoneInfo,
      ),
    [state.points, state.lines, state.polylines, state.featureLibrary, zoneInfo],
  )

  // Cambia cuando cambia el dataset → redispara fitBounds.
  const datasetKey = `${state.fileName ?? ''}:${state.points.length}:${state.lines.length}:${state.polylines.length}`

  const center = layers.bounds
    ? [
        (layers.bounds[0][0] + layers.bounds[1][0]) / 2,
        (layers.bounds[0][1] + layers.bounds[1][1]) / 2,
      ]
    : [0, 0]

  // relative z-0 + isolate: crea un stacking context propio para que los panes
  // internos de Leaflet (z-index 200–700) no tapen el drawer (z-50) ni modales.
  return (
    <div className="relative z-0 isolate h-full w-full bg-gray-950">
      {tileError && (
        <div className="absolute top-2 left-1/2 z-[500] -translate-x-1/2 rounded bg-amber-900/90 px-3 py-1.5 text-xs text-amber-100 shadow">
          Sin conexión: no se puede cargar el mapa base
        </div>
      )}
      <MapContainer center={center} zoom={13} preferCanvas className="h-full w-full">
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="OpenStreetMap">
            <TileLayer url={OSM_URL} attribution={OSM_ATTR} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satélite (Esri)">
            <TileLayer url={SAT_URL} attribution={SAT_ATTR} />
          </LayersControl.BaseLayer>
        </LayersControl>

        {layers.points.map((p) => (
          <CircleMarker
            key={p.key}
            center={p.latlng}
            radius={4}
            pathOptions={{ color: p.color, fillColor: p.color, fillOpacity: 0.9, weight: 1 }}
          >
            <Popup>
              <PointPopupBody popup={p.popup} />
            </Popup>
          </CircleMarker>
        ))}

        {layers.lines.map((l) => (
          <Polyline key={l.key} positions={l.latlngs} pathOptions={{ color: l.color, weight: 2 }}>
            <Popup>
              <FeaturePopupBody popup={l.popup} />
            </Popup>
          </Polyline>
        ))}

        {layers.polygons.map((pg) => (
          <Polygon
            key={pg.key}
            positions={pg.latlngs}
            pathOptions={{ color: pg.color, weight: 2, fillColor: pg.color, fillOpacity: 0.2 }}
          >
            <Popup>
              <FeaturePopupBody popup={pg.popup} />
            </Popup>
          </Polygon>
        ))}

        <MapController
          bounds={layers.bounds}
          datasetKey={datasetKey}
          active={active}
          onTileError={handleTileError}
        />
      </MapContainer>
    </div>
  )
}
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

Run: `npm test -- src/components/MapView/MapView.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/components/MapView/MapView.jsx src/components/MapView/MapView.test.jsx
git commit -m "feat(map): MapView con Leaflet (OSM + satélite, capas por color)"
```

---

### Task 4: Componente `ViewerStage` (control 3D | Mapa + gate + montaje perezoso)

**Files:**
- Create: `src/components/ViewerStage/ViewerStage.jsx`
- Test: `src/components/ViewerStage/ViewerStage.test.jsx`

**Interfaces:**
- Consumes: `useApp()`; `resolveZone`; `Viewer3D` (default export, sin props); `MapView` (Task 3, prop `active`).
- Produces: `export default function ViewerStage()`. Estado local `viewMode: '3d' | 'map'` (inicial `'3d'`) y `mapMounted`. Mantiene `Viewer3D` siempre montado; monta `MapView` perezosamente la primera vez que se entra a mapa y lo conserva oculto con `hidden`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/ViewerStage/ViewerStage.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ViewerStage from './ViewerStage'
import { useApp } from '../../context/AppContext'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../Viewer3D/Viewer3D', () => ({ default: () => <div data-testid="viewer3d" /> }))
vi.mock('../MapView/MapView', () => ({ default: () => <div data-testid="mapview" /> }))

const baseState = (parseOptions) => ({
  points: [{ x: 345000, y: 6300000, z: 0, codigo: 'A', nombre: 'P1' }],
  lines: [],
  polylines: [],
  featureLibrary: { A: { color: '#fff', capa: 'A' } },
  fileName: 'f.csv',
  rawCSVRows: [{ x: '-70.6', y: '-33.4' }],
  columnMapping: { x: 'x', y: 'y' },
  parseOptions,
  disabledRows: [],
})

const withCrs = () =>
  baseState({ coordSystem: 'geodetic', utmZone: 'auto', hemisphere: 'auto' })
const withoutCrs = () =>
  baseState({ coordSystem: 'projected', projectedCrs: 'local' })

beforeEach(() => vi.clearAllMocks())

describe('ViewerStage', () => {
  it('por defecto muestra el visor 3D y no monta el mapa', () => {
    useApp.mockReturnValue({ state: withCrs() })
    render(<ViewerStage />)
    expect(screen.getByTestId('viewer3d')).toBeInTheDocument()
    expect(screen.queryByTestId('mapview')).not.toBeInTheDocument()
  })

  it('sin CRS deshabilita "Mapa" con el motivo en title', () => {
    useApp.mockReturnValue({ state: withoutCrs() })
    render(<ViewerStage />)
    const btn = screen.getByRole('button', { name: 'Mapa' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', 'Requiere CRS — decláralo en Importar CSV')
  })

  it('con CRS habilita "Mapa" y al pulsarlo monta y muestra el mapa', () => {
    useApp.mockReturnValue({ state: withCrs() })
    render(<ViewerStage />)
    const btn = screen.getByRole('button', { name: 'Mapa' })
    expect(btn).toBeEnabled()
    fireEvent.click(btn)
    expect(screen.getByTestId('mapview')).toBeInTheDocument()
  })

  it('si el CRS desaparece estando en mapa, vuelve a 3D (fallback) y deshabilita "Mapa"', () => {
    useApp.mockReturnValue({ state: withCrs() })
    const { rerender } = render(<ViewerStage />)
    fireEvent.click(screen.getByRole('button', { name: 'Mapa' }))
    // El mapa quedó montado (oculto tras el fallback) pero "Mapa" se deshabilita.
    useApp.mockReturnValue({ state: withoutCrs() })
    rerender(<ViewerStage />)
    expect(screen.getByRole('button', { name: 'Mapa' })).toBeDisabled()
    // Wrapper del mapa oculto; el del 3D visible.
    expect(screen.getByTestId('mapview').parentElement.className).toContain('hidden')
    expect(screen.getByTestId('viewer3d').parentElement.className).not.toContain('hidden')
  })
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npm test -- src/components/ViewerStage/ViewerStage.test.jsx`
Expected: FAIL — no existe `./ViewerStage`.

- [ ] **Step 3: Implementar el componente**

Crear `src/components/ViewerStage/ViewerStage.jsx`:

```jsx
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { resolveZone } from '../../utils/geoConvert'
import Viewer3D from '../Viewer3D/Viewer3D'
import MapView from '../MapView/MapView'

const CRS_DISABLED_REASON = 'Requiere CRS — decláralo en Importar CSV'

export default function ViewerStage() {
  const { state } = useApp()
  const [viewMode, setViewMode] = useState('3d')
  // El mapa se monta perezosamente la primera vez que se entra al modo mapa y a
  // partir de ahí queda montado (oculto con `hidden`): así Leaflet no re-encuadra
  // ni recarga tiles al alternar, y la cámara 3D tampoco se resetea.
  const [mapMounted, setMapMounted] = useState(false)

  const zoneInfo = useMemo(
    () =>
      resolveZone(
        state.rawCSVRows,
        state.columnMapping,
        state.parseOptions,
        state.disabledRows,
      ),
    [state.rawCSVRows, state.columnMapping, state.parseOptions, state.disabledRows],
  )
  const mapAvailable = zoneInfo !== null

  // Si el CRS deja de ser resoluble estando en el mapa, volvemos a 3D (mismo
  // patrón que el ExportPanel al perder un formato WGS84).
  useEffect(() => {
    if (viewMode === 'map' && !mapAvailable) setViewMode('3d')
  }, [viewMode, mapAvailable])

  function showMap() {
    if (!mapAvailable) return
    setMapMounted(true)
    setViewMode('map')
  }

  const segBtn = (activeSeg) =>
    `px-3 py-1.5 transition-colors ${
      viewMode === activeSeg
        ? 'bg-emerald-600 text-white'
        : 'text-gray-300 hover:text-white'
    }`

  return (
    <div className="relative h-full w-full">
      <div className="absolute top-2 left-1/2 z-20 flex -translate-x-1/2 overflow-hidden rounded-md border border-gray-700 bg-gray-900/90 text-sm shadow">
        <button type="button" onClick={() => setViewMode('3d')} className={segBtn('3d')}>
          3D
        </button>
        <button
          type="button"
          onClick={showMap}
          disabled={!mapAvailable}
          title={mapAvailable ? undefined : CRS_DISABLED_REASON}
          className={`${segBtn('map')} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          Mapa
        </button>
      </div>

      <div className={`h-full w-full ${viewMode === '3d' ? '' : 'hidden'}`}>
        <Viewer3D />
      </div>
      {mapMounted && (
        <div className={`h-full w-full ${viewMode === 'map' ? '' : 'hidden'}`}>
          <MapView active={viewMode === 'map'} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `npm test -- src/components/ViewerStage/ViewerStage.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ViewerStage/ViewerStage.jsx src/components/ViewerStage/ViewerStage.test.jsx
git commit -m "feat(viewer): ViewerStage con control 3D | Mapa y gate por CRS"
```

---

### Task 5: Cablear `ViewerStage` en `App.jsx` y verificación integral

**Files:**
- Modify: `src/App.jsx:4,31`

**Interfaces:**
- Consumes: `ViewerStage` (Task 4, default export).
- Produces: `case 'viewer'` de `MainArea` renderiza `<ViewerStage />` en lugar de `<Viewer3D />`.

- [ ] **Step 1: Reemplazar el import**

En `src/App.jsx` línea 4, reemplazar:

```js
import Viewer3D from './components/Viewer3D/Viewer3D'
```

por:

```js
import ViewerStage from './components/ViewerStage/ViewerStage'
```

- [ ] **Step 2: Reemplazar el render del caso viewer**

En `src/App.jsx`, en `MainArea`, reemplazar:

```js
    case 'viewer':
      return <Viewer3D />
```

por:

```js
    case 'viewer':
      return <ViewerStage />
```

- [ ] **Step 3: Confirmar que no queda ningún uso huérfano de Viewer3D en App.jsx**

Run: `grep -n "Viewer3D" src/App.jsx`
Expected: sin resultados (Viewer3D ahora solo se usa dentro de ViewerStage).

- [ ] **Step 4: Ejecutar toda la suite de tests**

Run: `npm test`
Expected: PASS — sin regresiones en los tests existentes y con los nuevos de Tasks 1–4.

- [ ] **Step 5: Verificar el build de producción**

Run: `npm run build`
Expected: build exitoso (Vite empaqueta leaflet/react-leaflet sin errores).

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat(viewer): usar ViewerStage en la etapa de visualización"
```

---

## Criterios de aceptación (verificación final)

1. El stepper dice "Vista" (Task 1) y el flujo existente sigue igual.
2. Con un CSV geodésico, "Mapa" está habilitado; al activarlo, los puntos caen en la ubicación real con los colores de la biblioteca (Tasks 2–4).
3. Con un CSV plano y zona UTM declarada, el mapa funciona (reproyección inversa vía `reprojectGeometryToWGS84`).
4. Con un CSV plano sin CRS, "Mapa" aparece deshabilitado con el motivo en `title`; el 3D funciona como siempre (Task 4).
5. Alternar 3D ⇄ Mapa no resetea la cámara 3D ni re-encuadra el mapa (ambas vistas montadas, `fitBounds` atado a `datasetKey`).
6. Ocultar un código en la biblioteca lo oculta en el mapa (`buildMapLayers` filtra por `visible !== false`).
7. `npm test` y `npm run build` pasan; el visor 3D no sufre regresiones (Task 5).
