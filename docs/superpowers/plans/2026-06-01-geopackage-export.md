# GeoPackage Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GeoPackage (`.gpkg`) as a fourth export format in Point2CAD, generated with geopandas/fiona and loaded in the background during the CSV import workflow so the default DXF flow is never slowed down.

**Architecture:** A new Python generator (`geopackage_generator.py`) builds the `.gpkg` with geopandas (`GeoDataFrame.to_file(driver="GPKG")`), one layer per geometry type, and returns it base64-encoded (binary, exactly like the Shapefile generator). The heavy geopandas+fiona+GDAL stack is **not** installed at startup; instead a non-blocking background preload (`pyodide.loadPackage(['geopandas','fiona'])`) is triggered the moment the user leaves the idle stage (starts importing/mapping a CSV). The export call awaits that same memoized promise, so it is instant if the preload already finished, or simply waits otherwise. The export panel shows a "Preparando GeoPackage…" state until the packages are ready.

**Tech Stack:** Pyodide 0.26.2 (geopandas 0.14.3, fiona 1.9.5, shapely 2.0.2, GDAL 3.8.3 shared lib — all confirmed present in the pyodide lock file), React 18 + Vite, existing `EXPORT_FORMATS` registry in `usePythonBridge.js`.

---

## File Structure

**New files:**
- `python/geopackage_generator.py` — `generate_geopackage_b64(geometry, feature_library, options=None) -> str`. Builds the GeoPackage with geopandas and returns base64. Mirrors the responsibility/shape of `python/shapefile_generator.py`.
- `src/hooks/useGeopackagePreload.js` — fires the one-time background package preload when the app leaves the idle stage.
- `tests/python/test_geopackage_generator.py` — pytest verifying layers, geometry types, attributes and Z preservation by reading the `.gpkg` back with geopandas.

**Modified files:**
- `src/context/PyodideContext.jsx` — expose `ensurePackages(names)` (memoized lazy `loadPackage`) and `isPackagesReady(names)`.
- `src/hooks/usePythonBridge.js` — register `geopackage` in `EXPORT_FORMATS` with `requiresPackages`; have `exportGeometry` await `ensurePackages` for formats that declare it.
- `src/components/ExportPanel/ExportPanel.jsx` — add the GeoPackage option and the "Preparando…" disabled state until packages are ready.
- `src/App.jsx` — call `useGeopackagePreload()`.

---

## Task 1: GeoPackage Python generator (TDD)

**Files:**
- Create: `python/geopackage_generator.py`
- Test: `tests/python/test_geopackage_generator.py`

This task is fully testable with a local Python venv that has geopandas installed (the same code runs unchanged in Pyodide). The browser wiring is in later tasks.

- [ ] **Step 1: Create a venv with geopandas for testing**

Run:
```bash
python3 -m venv /tmp/gpkg_venv
/tmp/gpkg_venv/bin/pip install --quiet geopandas
/tmp/gpkg_venv/bin/python -c "import geopandas, fiona; print('geopandas', geopandas.__version__, 'fiona', fiona.__version__)"
```
Expected: prints geopandas and fiona versions with no import error.

- [ ] **Step 2: Write the failing test**

Create `tests/python/test_geopackage_generator.py`:

```python
import base64
import os
import sys
import tempfile

import geopandas as gpd

# Cargar el generador como módulo aislado (no hay paquete python/ instalable).
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "python"))
from geopackage_generator import generate_geopackage_b64  # noqa: E402


GEOMETRY = {
    "points": [
        {"x": 100.0, "y": 200.0, "z": 5.0, "codigo": "ARBOL", "nombre": "P1"},
        {"x": 110.0, "y": 210.0, "z": 6.0, "codigo": "ARBOL", "nombre": "P2"},
    ],
    "lines": [
        {"codigo": "CERCA", "vertices": [[0, 0, 1], [10, 0, 1], [10, 10, 2]]},
    ],
    "polylines": [
        {"codigo": "BORDE", "vertices": [[0, 0, 0], [5, 0, 0], [5, 5, 0]]},
    ],
}
FEATURE_LIBRARY = {
    "ARBOL": {"capa": "ARBOLES", "color": "#00ff00"},
    "CERCA": {"capa": "CERCAS", "color": "#ff0000"},
    "BORDE": {"capa": "BORDES", "color": "#0000ff"},
}


def _write_gpkg(tmp_path):
    b64 = generate_geopackage_b64(GEOMETRY, FEATURE_LIBRARY)
    path = os.path.join(tmp_path, "out.gpkg")
    with open(path, "wb") as f:
        f.write(base64.b64decode(b64))
    return path


def test_layers_present():
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_gpkg(tmp)
        import fiona
        layers = set(fiona.listlayers(path))
    assert layers == {"points", "lines", "polygons"}


def test_points_attributes_and_count():
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_gpkg(tmp)
        gdf = gpd.read_file(path, layer="points")
    assert len(gdf) == 2
    assert list(gdf["codigo"]) == ["ARBOL", "ARBOL"]
    assert list(gdf["capa"]) == ["ARBOLES", "ARBOLES"]
    assert list(gdf["nombre"]) == ["P1", "P2"]


def test_z_is_preserved():
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_gpkg(tmp)
        gdf = gpd.read_file(path, layer="points")
    assert gdf.geometry.iloc[0].has_z
    assert gdf.geometry.iloc[0].z == 5.0


def test_polygon_ring_is_closed():
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_gpkg(tmp)
        gdf = gpd.read_file(path, layer="polygons")
    coords = list(gdf.geometry.iloc[0].exterior.coords)
    assert coords[0] == coords[-1]


def test_options_arg_is_accepted():
    # Firma uniforme con los demás generadores; no debe fallar al recibir options.
    out = generate_geopackage_b64(GEOMETRY, FEATURE_LIBRARY, {"include_labels": False})
    assert isinstance(out, str) and len(out) > 0
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
/tmp/gpkg_venv/bin/python -m pytest tests/python/test_geopackage_generator.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'geopackage_generator'` (the file does not exist yet).

- [ ] **Step 4: Write the generator implementation**

Create `python/geopackage_generator.py`:

```python
"""
geopackage_generator.py
-----------------------
Responsabilidad: generar un archivo GeoPackage (.gpkg) a partir de la geometría
procesada, usando geopandas/fiona (disponibles en Pyodide tras loadPackage).

Un GeoPackage admite varias capas en un solo archivo, así que se crea una capa
por tipo de geometría presente (conservando Z, como el DXF/Shapefile 3D):
  - puntos              → capa "points"   (PointZ)
  - líneas              → capa "lines"    (LineStringZ)
  - polilíneas cerradas → capa "polygons" (PolygonZ)

No se asigna CRS (crs=None): las coordenadas son UTM planas y el sistema de
referencia se define al abrir el archivo en el SIG.

Atributos: codigo, capa (y nombre solo en puntos).

Entrada : geometry (dict) — salida de geometry_builder
          feature_library (dict) — mapa de códigos
          options (dict|None) — aceptado por uniformidad de firma; no aplica.
Salida  : .gpkg codificado en base64 (string), para transportarlo por stdout.
"""

import base64
import os
import tempfile

import geopandas as gpd
from shapely.geometry import LineString, Point, Polygon


def _capa(feature_library: dict, codigo: str) -> str:
    return feature_library.get(codigo, {}).get("capa", codigo)


def _closed_ring(poly: dict):
    ring = [(v[0], v[1], v[2]) for v in poly["vertices"]]
    if ring and ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring


def generate_geopackage_b64(geometry: dict, feature_library: dict, options: dict = None) -> str:
    points = geometry.get("points", [])
    lines = geometry.get("lines", [])
    polylines = geometry.get("polylines", [])

    workdir = tempfile.mkdtemp()
    path = os.path.join(workdir, "export.gpkg")

    if points:
        gdf = gpd.GeoDataFrame(
            {
                "codigo": [p["codigo"] for p in points],
                "capa": [_capa(feature_library, p["codigo"]) for p in points],
                "nombre": [p.get("nombre", "") for p in points],
            },
            geometry=[Point(p["x"], p["y"], p["z"]) for p in points],
            crs=None,
        )
        gdf.to_file(path, layer="points", driver="GPKG")

    if lines:
        gdf = gpd.GeoDataFrame(
            {
                "codigo": [l["codigo"] for l in lines],
                "capa": [_capa(feature_library, l["codigo"]) for l in lines],
            },
            geometry=[
                LineString([(v[0], v[1], v[2]) for v in l["vertices"]]) for l in lines
            ],
            crs=None,
        )
        gdf.to_file(path, layer="lines", driver="GPKG")

    if polylines:
        gdf = gpd.GeoDataFrame(
            {
                "codigo": [p["codigo"] for p in polylines],
                "capa": [_capa(feature_library, p["codigo"]) for p in polylines],
            },
            geometry=[Polygon(_closed_ring(p)) for p in polylines],
            crs=None,
        )
        gdf.to_file(path, layer="polygons", driver="GPKG")

    with open(path, "rb") as f:
        data = f.read()
    return base64.b64encode(data).decode("ascii")
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
/tmp/gpkg_venv/bin/python -m pytest tests/python/test_geopackage_generator.py -v
```
Expected: all 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add python/geopackage_generator.py tests/python/test_geopackage_generator.py
git commit -m "feat: add GeoPackage generator (geopandas)"
```

---

## Task 2: Lazy package loading in PyodideContext

**Files:**
- Modify: `src/context/PyodideContext.jsx`

Add a memoized `ensurePackages(names)` that calls `pyodide.loadPackage` at most once per package set, plus `isPackagesReady(names)` for the UI. This does **not** change the startup install of ezdxf/pyshp.

- [ ] **Step 1: Add refs/state and the two functions**

In `src/context/PyodideContext.jsx`, add a ref and state near the existing refs (after `const initPromiseRef = useRef(null)`):

```jsx
  const pkgPromisesRef = useRef({})
  const [loadedPkgs, setLoadedPkgs] = useState({})
```

Then add these two callbacks right after the existing `runPython` callback (before the `return`):

```jsx
  // Carga perezosa y memoizada de paquetes Pyodide pesados (p.ej. geopandas).
  // Se puede llamar en segundo plano durante el flujo para precalentar.
  const ensurePackages = useCallback(async (names) => {
    await initPromiseRef.current
    const py = pyRef.current
    if (!py) return
    const key = [...names].sort().join(',')
    if (!pkgPromisesRef.current[key]) {
      pkgPromisesRef.current[key] = py
        .loadPackage(names)
        .then(() => setLoadedPkgs((m) => ({ ...m, [key]: true })))
        .catch((err) => {
          // Permite reintentar en el próximo llamado.
          delete pkgPromisesRef.current[key]
          throw err
        })
    }
    return pkgPromisesRef.current[key]
  }, [])

  const isPackagesReady = useCallback(
    (names) => loadedPkgs[[...names].sort().join(',')] === true,
    [loadedPkgs]
  )
```

- [ ] **Step 2: Expose them in the context value**

Change the provider value line from:

```jsx
    <PyodideContext.Provider value={{ isLoading, isRunning, runPython }}>
```

to:

```jsx
    <PyodideContext.Provider
      value={{ isLoading, isRunning, runPython, ensurePackages, isPackagesReady }}
    >
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: `✓ built in …` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/context/PyodideContext.jsx
git commit -m "feat: add lazy ensurePackages to PyodideContext"
```

---

## Task 3: Register GeoPackage in the export bridge

**Files:**
- Modify: `src/hooks/usePythonBridge.js`

- [ ] **Step 1: Import the generator and register the format**

In `src/hooks/usePythonBridge.js`, add the import next to the other generator imports (after the shapefile import line):

```js
import geopackageGeneratorCode from '../../python/geopackage_generator.py?raw'
```

Add this entry to the `EXPORT_FORMATS` object, after the `shapefile` entry:

```js
  geopackage: {
    generatorCode: geopackageGeneratorCode,
    call: 'generate_geopackage_b64(geometry, feature_lib, options)',
    extension: '.gpkg',
    mimeType: 'application/geopackage+sqlite3',
    binary: true,
    requiresPackages: ['geopandas', 'fiona'],
  },
```

- [ ] **Step 2: Pull `ensurePackages` from the Pyodide context**

Change the hook's first line inside `usePythonBridge` from:

```js
  const { isLoading, isRunning, runPython } = usePyodide()
```

to:

```js
  const { isLoading, isRunning, runPython, ensurePackages } = usePyodide()
```

- [ ] **Step 3: Await required packages before running the generator**

In `exportGeometry`, immediately after the line `const outName = ...`, add:

```js
      if (fmt.requiresPackages) {
        await ensurePackages(fmt.requiresPackages)
      }
```

Then update the `useCallback` dependency array of `exportGeometry` from `[runPython]` to `[runPython, ensurePackages]`.

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: `✓ built in …` with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePythonBridge.js
git commit -m "feat: register GeoPackage export format with lazy package load"
```

---

## Task 4: Background preload hook

**Files:**
- Create: `src/hooks/useGeopackagePreload.js`
- Modify: `src/App.jsx`

Fire the package preload once, in the background, as soon as the user leaves the idle stage (starts importing/mapping). This is what hides the GDAL download behind the user's interaction time.

- [ ] **Step 1: Create the hook**

Create `src/hooks/useGeopackagePreload.js`:

```js
import { useEffect, useRef } from 'react'
import { usePyodide } from '../context/PyodideContext'
import { useApp } from '../context/AppContext'

// Precarga en segundo plano (no bloqueante) el stack pesado de GeoPackage
// (geopandas + fiona + GDAL) apenas el usuario empieza a importar/mapear un CSV,
// para que ya esté listo cuando llegue a exportar. Se dispara una sola vez.
export function useGeopackagePreload() {
  const { ensurePackages } = usePyodide()
  const { state } = useApp()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    if (state.appMode === 'idle') return
    started.current = true
    ensurePackages(['geopandas', 'fiona']).catch(() => {
      // Silencioso: si falla, exportGeometry reintentará y mostrará el error real.
    })
  }, [state.appMode, ensurePackages])
}
```

- [ ] **Step 2: Call the hook in App**

In `src/App.jsx`, add the import next to the other hook imports (after `import { useSessionRehydration } from './hooks/useSessionRehydration'`):

```jsx
import { useGeopackagePreload } from './hooks/useGeopackagePreload'
```

Inside the `App` component body, right after `const isRehydrating = useSessionRehydration()`, add:

```jsx
  useGeopackagePreload()
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: `✓ built in …` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useGeopackagePreload.js src/App.jsx
git commit -m "feat: preload GeoPackage packages in background during import"
```

---

## Task 5: ExportPanel option + "Preparando…" state

**Files:**
- Modify: `src/components/ExportPanel/ExportPanel.jsx`

- [ ] **Step 1: Add the option and read readiness from context**

In `src/components/ExportPanel/ExportPanel.jsx`, add the GeoPackage entry to `FORMAT_OPTIONS`:

```jsx
const FORMAT_OPTIONS = [
  { value: 'dxf', label: 'DXF' },
  { value: 'geojson', label: 'GeoJSON' },
  { value: 'shapefile', label: 'Shapefile (ZIP)' },
  { value: 'geopackage', label: 'GeoPackage (.gpkg)' },
]
```

Add the import for the Pyodide context at the top (next to the other imports):

```jsx
import { usePyodide } from '../../context/PyodideContext'
```

Inside the component, after the existing `const { state } = useApp()` line, add:

```jsx
  const { isPackagesReady } = usePyodide()
```

- [ ] **Step 2: Compute the GeoPackage readiness gate**

After the line `const isViewer = state.appMode === 'viewer'`, add:

```jsx
  // GeoPackage necesita geopandas+fiona; mientras se precargan, se deshabilita
  // el botón y se muestra "Preparando…".
  const geopkgPending =
    format === 'geopackage' && !isPackagesReady(['geopandas', 'fiona'])
```

- [ ] **Step 3: Reflect the pending state in the button label and disabled prop**

Replace the existing `label` block:

```jsx
  const formatLabel =
    FORMAT_OPTIONS.find((o) => o.value === format)?.label ?? 'DXF'
  const label = isRunning
    ? `Generando ${formatLabel}…`
    : isViewer
      ? 'Exportar selección'
      : `Exportar ${formatLabel}`
```

with:

```jsx
  const formatLabel =
    FORMAT_OPTIONS.find((o) => o.value === format)?.label ?? 'DXF'
  const label = isRunning
    ? `Generando ${formatLabel}…`
    : geopkgPending
      ? 'Preparando GeoPackage…'
      : isViewer
        ? 'Exportar selección'
        : `Exportar ${formatLabel}`
```

Then update the export button's `disabled` prop from:

```jsx
        disabled={isRunning || !hasGeometry}
```

to:

```jsx
        disabled={isRunning || !hasGeometry || geopkgPending}
```

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: `✓ built in …` with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ExportPanel/ExportPanel.jsx
git commit -m "feat: add GeoPackage option with preparing state to export panel"
```

---

## Task 6: End-to-end browser verification

**Files:** none (verification only). Uses the Playwright MCP, mirroring how the DXF/GeoJSON/Shapefile exports were verified.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Vite serving on `http://localhost:5173`.

- [ ] **Step 2: Drive the app and capture the GeoPackage blob**

Using the Playwright MCP:
1. Navigate to `http://localhost:5173`.
2. Load `example.csv`, map columns, detect codes, process, and enter the 3D viewer (same flow as existing export verification).
3. In the export panel, open the format dropdown and select **GeoPackage (.gpkg)**.
4. Before clicking, monkeypatch `URL.createObjectURL` to capture the Blob bytes (same technique used for the other formats).
5. Click **Exportar** (wait for the "Preparando GeoPackage…" state to clear first).

Expected: a download is triggered with a `.gpkg` filename; the captured blob starts with the SQLite magic header `"SQLite format 3\0"`.

- [ ] **Step 3: Validate the captured bytes are a real GeoPackage**

Save the captured bytes to `/tmp/verify.gpkg` and run:
```bash
/tmp/gpkg_venv/bin/python -c "import fiona; print(sorted(fiona.listlayers('/tmp/verify.gpkg')))"
```
Expected: prints a subset of `['lines', 'points', 'polygons']` matching `example.csv`'s geometry, with no error.

- [ ] **Step 4: Confirm DXF flow is not slowed**

In the same session, confirm that selecting **DXF** and exporting still works immediately (no waiting on geopandas), proving the heavy stack is only loaded in the background and only blocks GeoPackage.

Expected: DXF export downloads instantly as before.

---

## Notes / considerations

- **No startup cost for DXF users:** geopandas/fiona/GDAL are loaded only via the background preload (Task 4) and the lazy `ensurePackages` (Task 2). The startup `micropip.install('ezdxf'/'pyshp')` is untouched, so the default flow keeps its current load time.
- **Slow-connection safety net:** if the preload has not finished when the user picks GeoPackage, the button shows "Preparando GeoPackage…" and `exportGeometry` awaits the same memoized promise — correctness is guaranteed, only the wait differs.
- **Bandwidth tradeoff (accepted):** the preload starts for every user who imports a CSV, even if they only want DXF. This is the deliberate cost of hiding latency. If this becomes a concern, the trigger in `useGeopackagePreload` can later be narrowed (e.g. fire when the user first opens the format dropdown) without touching any other file.
- **CRS:** `crs=None` (planar UTM, unknown reference) — consistent with the Shapefile/GeoJSON generators. The user assigns the CRS when opening in QGIS.
- **Z preserved:** PointZ/LineStringZ/PolygonZ, consistent with the DXF/Shapefile 3D output.
- **Signature uniformity:** `generate_geopackage_b64(geometry, feature_library, options=None)` matches the other generators, so it plugs into `EXPORT_FORMATS` with no special handling beyond `requiresPackages`.

## Verification summary

1. `pytest tests/python/test_geopackage_generator.py` — layers, attributes, Z, closed ring, options arg (Task 1).
2. `npm run build` after each JS task — compiles clean (Tasks 2–5).
3. Playwright end-to-end: GeoPackage downloads, SQLite magic header, `fiona.listlayers` reads the layers back, DXF still instant (Task 6).
