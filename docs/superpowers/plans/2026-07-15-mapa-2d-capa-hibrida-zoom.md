# Capa "Híbrido" y más zoom en el mapa 2D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir una tercera capa base "Híbrido" (satélite + etiquetas Esri, sin API key) al `MapView`, y aumentar el zoom máximo disponible en las tres capas base de 18 (default) a 21 mediante over-zoom.

**Architecture:** Nueva constante `LABELS_URL` (servicio público Esri `Reference/World_Boundaries_and_Places`) combinada con la `SAT_URL` ya existente dentro de un `LayerGroup`, registrado como una tercera `LayersControl.BaseLayer`. `MapContainer` y las tres capas base reciben `maxZoom={21}`; los `TileLayer` además reciben `maxNativeZoom={19}` para que Leaflet amplíe (over-zoom) el último tile disponible más allá de la resolución nativa real de los tres servicios (OSM y los dos de Esri), sin pedir tiles inexistentes.

**Tech Stack:** React 18, react-leaflet v4, Leaflet 1.9, Tailwind CSS, Vitest + Testing Library.

## Global Constraints

- No añadir dependencias nuevas.
- `LABELS_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'` — servicio público de Esri, sin API key, mismo dominio que `SAT_URL`.
- Atribución de la capa de etiquetas: reutilizar `SAT_ATTR` (Leaflet deduplica cadenas de atribución idénticas en su control; evita una entrada "Esri" repetida).
- `maxZoom={21}` en `MapContainer` y en las cuatro instancias de `TileLayer` (OSM, Satélite, y las dos dentro de Híbrido). `maxNativeZoom={19}` en las cuatro instancias de `TileLayer` únicamente (no es una prop de `MapContainer`).
- Nombre exacto de la nueva capa en el control: `"Híbrido"`.
- Tests: extender `src/components/MapView/MapView.test.jsx` (no crear un archivo de test separado).

---

### Task 1: Capa "Híbrido" + `maxZoom`/`maxNativeZoom` en las tres capas base

**Files:**
- Modify: `src/components/MapView/MapView.jsx`
- Test: `src/components/MapView/MapView.test.jsx`

**Interfaces:**
- Consumes: `TileLayer`, `LayersControl`, `LayersControl.BaseLayer` de `react-leaflet` (ya usados); `LayerGroup` de `react-leaflet` (nuevo import, no usado hasta ahora en este archivo).
- Produces: sin nuevos componentes ni funciones — cambios de configuración dentro de `MapView`. Ningún otro archivo del plan consume esto.

- [ ] **Step 1: Actualizar el mock de `react-leaflet` en `MapView.test.jsx`**

El mock actual (líneas 13-37) no captura `maxZoom`/`maxNativeZoom` en `TileLayer` ni `maxZoom` en `MapContainer`, no expone `name` en `LayersControl.BaseLayer`, y no incluye `LayerGroup`. Reemplazar el bloque completo `vi.mock('react-leaflet', ...)`:

```js
vi.mock('react-leaflet', () => {
  const Base = ({ children }) => <div>{children}</div>
  const LayersControl = ({ children }) => <div>{children}</div>
  LayersControl.BaseLayer = ({ name, children }) => (
    <div data-testid="baselayer" data-name={name}>{children}</div>
  )
  const LayerGroup = ({ children }) => <div data-testid="layergroup">{children}</div>
  const mapMock = { invalidateSize: vi.fn(), fitBounds: vi.fn(), on: vi.fn(), off: vi.fn() }
  return {
    MapContainer: ({ children, maxZoom }) => (
      <div data-testid="map" data-max-zoom={maxZoom}>{children}</div>
    ),
    TileLayer: ({ url, crossOrigin, maxZoom, maxNativeZoom }) => (
      <div
        data-testid="tile"
        data-url={url}
        data-cross={crossOrigin}
        data-max-zoom={maxZoom}
        data-max-native-zoom={maxNativeZoom}
      />
    ),
    LayersControl,
    LayerGroup,
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
    useMap: () => mapMock,
    __mapMock: mapMock,
  }
})
```

- [ ] **Step 2: Escribir los tests que fallan en `MapView.test.jsx`**

Actualizar el import de Testing Library (línea 2 actual) para incluir `within`:

```js
import { render, screen, fireEvent, within } from '@testing-library/react'
```

Reemplazar las dos pruebas existentes que asumían solo dos capas base
(`'renderiza las dos capas base (OSM y satélite)'` y
`'las dos capas base llevan crossOrigin="anonymous"...'`, líneas 70-81
actuales) por estas cuatro:

```js
  it('renderiza las tres capas base (OSM, satélite e híbrido)', () => {
    render(<MapView />)
    const names = screen.getAllByTestId('baselayer').map((el) => el.getAttribute('data-name'))
    expect(names).toEqual(['OpenStreetMap', 'Satélite (Esri)', 'Híbrido'])
  })

  it('todas las capas de tiles llevan crossOrigin="anonymous" (para pasar COEP require-corp)', () => {
    render(<MapView />)
    const crossValues = screen.getAllByTestId('tile').map((t) => t.getAttribute('data-cross'))
    expect(crossValues).toEqual(['anonymous', 'anonymous', 'anonymous', 'anonymous'])
  })

  it('la capa "Híbrido" combina imagen satelital y etiquetas (dos TileLayer con URLs distintas)', () => {
    render(<MapView />)
    const hibrido = screen
      .getAllByTestId('baselayer')
      .find((el) => el.getAttribute('data-name') === 'Híbrido')
    const urls = within(hibrido).getAllByTestId('tile').map((t) => t.getAttribute('data-url'))
    expect(urls).toHaveLength(2)
    expect(urls[0]).toContain('World_Imagery')
    expect(urls[1]).toContain('World_Boundaries_and_Places')
  })

  it('el mapa y las capas de tiles permiten zoom hasta 21 (over-zoom con maxNativeZoom 19)', () => {
    render(<MapView />)
    expect(screen.getByTestId('map').getAttribute('data-max-zoom')).toBe('21')

    const tiles = screen.getAllByTestId('tile')
    expect(tiles).toHaveLength(4)
    tiles.forEach((tile) => {
      expect(tile.getAttribute('data-max-zoom')).toBe('21')
      expect(tile.getAttribute('data-max-native-zoom')).toBe('19')
    })
  })
```

Los tests restantes del archivo (colores por tipo, suscripción de eventos,
botón "Ajustar vista") no cambian.

- [ ] **Step 3: Ejecutar los tests para confirmar que fallan**

Run: `npm test -- MapView.test.jsx`
Expected: FAIL — las cuatro pruebas nuevas fallan porque `MapView.jsx`
todavía solo tiene dos capas base sin `maxZoom`/`maxNativeZoom` (p. ej.
`names` tendrá solo 2 elementos, no 3; `data-max-zoom` será `undefined`,
no `'21'`).

- [ ] **Step 4: Modificar `MapView.jsx` — imports y constantes**

Añadir `LayerGroup` al import de `react-leaflet` (línea 2-11 actual):

```jsx
import {
  MapContainer,
  TileLayer,
  LayersControl,
  LayerGroup,
  CircleMarker,
  Polyline,
  Polygon,
  Popup,
  useMap,
} from 'react-leaflet'
```

Añadir `LABELS_URL` después de `SAT_ATTR` (línea 22 actual):

```js
const SAT_ATTR = 'Esri, Maxar, Earthstar Geographics'
const LABELS_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
```

- [ ] **Step 5: Modificar `MapView.jsx` — `MapContainer` y capas base**

Reemplazar el bloque `<MapContainer>` + `<LayersControl>` (líneas 124-136
actuales):

```jsx
      <MapContainer center={center} zoom={13} maxZoom={21} preferCanvas className="h-full w-full">
        {/* crossOrigin="anonymous": el dev server fija COEP require-corp (vite.config.js)
            y Leaflet 1.9 no pide los tiles con atributo crossorigin por defecto. Ambos
            hosts responden con Access-Control-Allow-Origin: *, así que un fetch en modo
            CORS satisface el COEP y evita que el navegador bloquee los tiles.
            maxNativeZoom={19}: los tres servicios (OSM y los dos de Esri) sirven tiles
            nativos hasta zoom 19; maxZoom={21} en MapContainer y aquí permite que
            Leaflet amplíe (over-zoom) el último tile disponible por encima de eso. */}
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="OpenStreetMap">
            <TileLayer
              url={OSM_URL}
              attribution={OSM_ATTR}
              crossOrigin="anonymous"
              maxZoom={21}
              maxNativeZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satélite (Esri)">
            <TileLayer
              url={SAT_URL}
              attribution={SAT_ATTR}
              crossOrigin="anonymous"
              maxZoom={21}
              maxNativeZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Híbrido">
            <LayerGroup>
              <TileLayer
                url={SAT_URL}
                attribution={SAT_ATTR}
                crossOrigin="anonymous"
                maxZoom={21}
                maxNativeZoom={19}
              />
              <TileLayer
                url={LABELS_URL}
                attribution={SAT_ATTR}
                crossOrigin="anonymous"
                maxZoom={21}
                maxNativeZoom={19}
              />
            </LayerGroup>
          </LayersControl.BaseLayer>
        </LayersControl>
```

El resto del archivo (`<MapToolbar .../>`, geometrías, `<MapController
.../>`, cierre de `</MapContainer>`) no cambia.

- [ ] **Step 6: Ejecutar los tests para confirmar que pasan**

Run: `npm test -- MapView.test.jsx`
Expected: PASS — las 9 pruebas del archivo (las 2 antiguas de capas base
son reemplazadas por las 4 nuevas del Step 2; las otras 5 pruebas
existentes — colores, eventos, botón "Ajustar vista" — no cambian: 5 + 4 = 9).

- [ ] **Step 7: Ejecutar la suite completa y el build**

Run: `npm test && npm run build`
Expected: PASS sin regresiones en otras suites (`ViewerStage.test.jsx`,
`Viewer3D`, etc.) ni errores de build.

- [ ] **Step 8: Commit**

```bash
git add src/components/MapView/MapView.jsx src/components/MapView/MapView.test.jsx
git commit -m "$(cat <<'EOF'
feat(map): capa "Híbrido" y más zoom (hasta 21) en el mapa 2D

Nueva capa base que combina la imagen satelital de Esri con su capa de
referencia de etiquetas (nombres, calles, límites), sin API key. maxZoom
sube de 18 a 21 en las tres capas base vía over-zoom (maxNativeZoom=19).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016i1dzweA774VK91dTNLDaT
EOF
)"
```

---

## Verificación manual (opcional pero recomendada)

Tras completar la Task 1, levantar la app (`npm run dev`), entrar a la
etapa Vista en modo Mapa, abrir el control de capas (esquina superior
derecha) y confirmar que aparecen tres opciones: "OpenStreetMap",
"Satélite (Esri)" e "Híbrido". Seleccionar "Híbrido" y confirmar que se ve
la imagen satelital con nombres de calles/lugares superpuestos. Acercar el
zoom al máximo con la rueda del mouse o los controles +/- de Leaflet y
confirmar que se puede llegar más allá del nivel 18 (el mapa amplía el
último tile disponible en vez de detenerse o mostrar tiles en blanco).
