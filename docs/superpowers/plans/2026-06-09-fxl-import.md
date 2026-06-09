# Importador de biblioteca de características FXL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir cargar un `.fxl` de Trimble (opcional, junto a la vista previa del CSV) para sembrar capa, color, tipo (punto/línea/polígono) y roles de control code de forma autoritativa, por encima de la heurística pero respetando las ediciones manuales del usuario.

**Architecture:** El FXL (XML) se parsea en Python (`fxl_parser.py`). El color/capa viven en JS (`featureLibrary`); los roles y tipos vuelven a Python en cada detección/proceso como *hints* (`fxl_roles`, `fxl_types`) que se integran en `field_codes.py` y `geometry_builder.py` con prioridad: usuario → FXL → heurística. El estado (`state.fxl`, `state.userEditedCodes`) se persiste en sesión.

**Tech Stack:** Python 3.12 (stdlib `xml.etree.ElementTree`) en Pyodide; React + useReducer; Vitest + @testing-library/react; pytest.

**Spec:** `docs/superpowers/specs/2026-06-09-fxl-import-design.md`

**Convención de tests Python (existente):** los tests viven en `tests/python/` e importan los módulos con `sys.path.insert(0, ...python)`. Ejecutar con el venv del proyecto. Comando base usado en el repo:
`/tmp/p2c_uv/bin/pytest tests/python/<archivo> -v` (si no existe el venv, crear con `uv venv /tmp/p2c_uv && /tmp/p2c_uv/bin/python -m pip install pytest geopandas fiona pyproj pyshp`).

---

## File Structure

- **Create** `python/fxl_parser.py` — parseo del XML FXL → `{features, control_roles}`. Una responsabilidad: leer el FXL.
- **Modify** `python/field_codes.py` — `fit()` acepta `fxl_roles`; `classify_codes`/`detect_codes`/`linear_code_set` + nuevo `closed_code_set` aceptan `fxl_types` autoritativo.
- **Modify** `python/geometry_builder.py` — `build_geometry()` propaga `fxl_roles`/`fxl_types`; `finalize` cierra polígonos FXL sin terminador explícito.
- **Modify** `src/context/AppContext.jsx` — estado `fxl`/`userEditedCodes`, acciones `LOAD_FXL`/`CLEAR_FXL`, `buildFeatureLibrary` con FXL, `UPDATE_FEATURE` marca ediciones.
- **Modify** `src/utils/sessionStorage.js` — persistir `fxl` y `userEditedCodes`.
- **Modify** `src/hooks/usePythonBridge.js` — `parseFxl()`; inyectar `fxl_hints` en `detectCodes`/`processCSV` leyendo `state.fxl`.
- **Create** `src/hooks/useFxlLoader.js` — lee archivo, llama `parseFxl`, despacha `LOAD_FXL`/error.
- **Modify** `src/components/CSVPreview/CSVPreview.jsx` — bloque UI de importación FXL + indicador "FXL".
- **Create** `tests/python/test_fxl_parser.py`, `tests/python/test_fxl_integration.py`
- **Create** `src/context/AppContext.fxl.test.js`, `src/hooks/useFxlLoader.test.js`

---

## Task 1: Parser FXL en Python

**Files:**
- Create: `python/fxl_parser.py`
- Test: `tests/python/test_fxl_parser.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/python/test_fxl_parser.py
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "python"))
from fxl_parser import parse_fxl  # noqa: E402

# FXL sintético propio (no muestra de Trimble), con namespace raíz real.
SAMPLE = """<?xml version="1.0" encoding="utf-8"?>
<FeatureCodingDefinitions xmlns="http://trimble.com/schema/fxl" SchemaVersion="9">
  <LayerDefinitions>
    <LayerDefinition Name="CERCAS" Color="FF00FF00"/>
  </LayerDefinitions>
  <ControlCodeDefinitions>
    <ControlCodeDefinition Code="ini" Description="Iniciar" Type="Start"/>
    <ControlCodeDefinition Code="fin" Description="Finalizar" Type="End"/>
    <ControlCodeDefinition Code="cer" Description="Cerrar" Type="Close"/>
  </ControlCodeDefinitions>
  <FeatureDefinitions>
    <PointFeatureDefinition Code="ARBOL" Name="Arbol" Color="FE000000" Layer="VEGETACION"/>
    <PointFeatureDefinition Code="HITO" Name="Hito" Layer="0"/>
    <LineFeatureDefinition Code="CERCA" Name="Cerca" Layer="CERCAS"/>
    <PolygonFeatureDefinition Code="EDIF" Name="Edificio" Color="FFFF0000" Layer="EDIFICIOS"/>
  </FeatureDefinitions>
</FeatureCodingDefinitions>
"""


def test_features_tipo_mapping():
    out = parse_fxl(SAMPLE)
    f = out["features"]
    assert f["ARBOL"]["tipo"] == "Punto"
    assert f["CERCA"]["tipo"] == "Línea abierta"
    assert f["EDIF"]["tipo"] == "Polilínea cerrada"


def test_color_argb_to_hex_drops_alpha():
    out = parse_fxl(SAMPLE)
    assert out["features"]["ARBOL"]["color"] == "#000000"
    assert out["features"]["EDIF"]["color"] == "#ff0000"


def test_layer_zero_and_missing_become_none():
    out = parse_fxl(SAMPLE)
    assert out["features"]["HITO"]["capa"] is None  # Layer="0"
    assert out["features"]["ARBOL"]["capa"] == "VEGETACION"


def test_color_fallback_from_layer_when_feature_has_no_color():
    # CERCA no trae Color; hereda el de su capa CERCAS (FF00FF00 → #00ff00).
    out = parse_fxl(SAMPLE)
    assert out["features"]["CERCA"]["color"] == "#00ff00"


def test_control_roles_mapping():
    out = parse_fxl(SAMPLE)
    assert out["control_roles"] == {"ini": "start", "fin": "end", "cer": "close"}


def test_invalid_xml_raises_valueerror():
    with pytest.raises(ValueError):
        parse_fxl("esto no es xml <<<")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/tmp/p2c_uv/bin/pytest tests/python/test_fxl_parser.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'fxl_parser'`.

- [ ] **Step 3: Write minimal implementation**

```python
# python/fxl_parser.py
"""
fxl_parser.py
-------------
Responsabilidad: leer una biblioteca de características Trimble (.fxl, XML) que
aporta el usuario y extraer SOLO lo que el proyecto usa:

  - features: { CODIGO: {capa, color, tipo} } donde tipo ∈ {Punto, Línea abierta,
    Polilínea cerrada}; color en "#RRGGBB" o None; capa = nombre de capa o None.
  - control_roles: { código_de_campo(lower): rol } a partir de ControlCodeDefinitions.

No parsea símbolos, atributos, estilos de línea ni etiquetado (fuera de alcance).
El parseo es por observación de archivos reales (interoperabilidad); no se incluye
ningún esquema ni muestra de Trimble en el repo.
"""

import xml.etree.ElementTree as ET

# Literales de tipo (deben coincidir con field_codes.TIPO_*).
TIPO_PUNTO = "Punto"
TIPO_LINEA = "Línea abierta"
TIPO_POLIGONO = "Polilínea cerrada"

_NS = "{http://trimble.com/schema/fxl}"

# ControlCodeDefinition Type → rol del proyecto (mismos literales que field_codes).
_TYPE_TO_ROLE = {
    "Start": "start",
    "End": "end",
    "Close": "close",
    "Join": "join",
    "Smooth": "smooth",
    "Arc": "arc",
    "StartArc": "arc",
    "Rectangle": "rect",
    "Circle": "circle",
}

_DEF_TIPO = {
    "PointFeatureDefinition": TIPO_PUNTO,
    "LineFeatureDefinition": TIPO_LINEA,
    "PolygonFeatureDefinition": TIPO_POLIGONO,
}


def _argb_to_hex(argb):
    """'FE000000' (ARGB) → '#000000'. Devuelve None si no es un hex de 8 dígitos."""
    if not argb or len(argb) != 8:
        return None
    try:
        int(argb, 16)
    except ValueError:
        return None
    return "#" + argb[2:].lower()


def _local(tag):
    """Quita el namespace de un tag: '{...}LineFeatureDefinition' → 'LineFeatureDefinition'."""
    return tag.split("}", 1)[-1]


def parse_fxl(xml_text: str) -> dict:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise ValueError(f"FXL no es XML válido: {exc}") from exc

    # Mapa capa→color para usar como fallback del color de un feature.
    layer_colors = {}
    for layer in root.iter(f"{_NS}LayerDefinition"):
        name = layer.get("Name")
        color = _argb_to_hex(layer.get("Color"))
        if name:
            layer_colors[name] = color

    features = {}
    for el in root.iter():
        tipo = _DEF_TIPO.get(_local(el.tag))
        if tipo is None:
            continue
        code = el.get("Code")
        if not code:
            continue
        layer = el.get("Layer")
        capa = None if layer in (None, "", "0") else layer
        color = _argb_to_hex(el.get("Color"))
        if color is None and capa is not None:
            color = layer_colors.get(capa)
        features[code] = {"capa": capa, "color": color, "tipo": tipo}

    control_roles = {}
    for cc in root.iter(f"{_NS}ControlCodeDefinition"):
        code = cc.get("Code")
        role = _TYPE_TO_ROLE.get(cc.get("Type"))
        if code and role:
            control_roles[code.lower()] = role

    return {"features": features, "control_roles": control_roles}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `/tmp/p2c_uv/bin/pytest tests/python/test_fxl_parser.py -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add python/fxl_parser.py tests/python/test_fxl_parser.py
git commit -m "feat(fxl): parser de biblioteca de características Trimble (.fxl)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `field_codes.fit()` acepta roles del FXL

**Files:**
- Modify: `python/field_codes.py:215-255` (`ControlCodeModel.fit`), `python/field_codes.py:445-462` (`detect_control_codes`)
- Test: `tests/python/test_fxl_integration.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/python/test_fxl_integration.py
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "python"))
from field_codes import detect_dialect, detect_control_codes  # noqa: E402

# Puntos donde "zz" aparece como token de control en pos≥2, sin léxico que lo cubra.
POINTS = [
    {"codigo": "CERCA", "x": 0, "y": 0, "z": 0, "nombre": "1"},
    {"codigo": "CERCA zz", "x": 10, "y": 0, "z": 0, "nombre": "2"},
]


def test_fxl_role_beats_heuristic():
    # Sin FXL: "zz" se resuelve por geometría (end/close). Con FXL: start.
    dialect = detect_dialect(POINTS)
    model = dialect.fit(POINTS, overrides=None, fxl_roles={"zz": "start"})
    assert model.role("zz") == "start"
    assert model.meta["zz"]["source"] == "fxl"


def test_user_override_beats_fxl():
    dialect = detect_dialect(POINTS)
    model = dialect.fit(POINTS, overrides={"zz": "end"}, fxl_roles={"zz": "start"})
    assert model.role("zz") == "end"
    assert model.meta["zz"]["source"] == "override"


def test_detect_control_codes_reports_fxl_source():
    out = detect_control_codes(POINTS, overrides=None, fxl_roles={"zz": "start"})
    row = next(r for r in out if r["token"] == "zz")
    assert row["role"] == "start"
    assert row["source"] == "fxl"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/tmp/p2c_uv/bin/pytest tests/python/test_fxl_integration.py -v`
Expected: FAIL (`fit() got an unexpected keyword argument 'fxl_roles'`).

- [ ] **Step 3: Modify `fit` signature and priority chain**

En `python/field_codes.py`, reemplazar la cabecera y el bucle de roles de `fit` (líneas ~215-255). Cambiar la firma:

```python
    def fit(self, points: list[dict], overrides: dict | None = None,
            fxl_roles: dict | None = None) -> ControlCodeModel:
        """Aprende el rol de cada control code del CSV. Prioridad:
        `overrides` (usuario) → `fxl_roles` (FXL) → léxico → geometría."""
        overrides = {k.lower(): v for k, v in (overrides or {}).items()}
        fxl_roles = {k.lower(): v for k, v in (fxl_roles or {}).items()}
```

Y dentro de ese método, añadir las claves del FXL al vocabulario de control y la rama de prioridad. Reemplazar:

```python
        control_vocab = {t for t in later_counts if t not in first_tokens}
        control_vocab |= set(overrides.keys())
```

por:

```python
        control_vocab = {t for t in later_counts if t not in first_tokens}
        control_vocab |= set(overrides.keys())
        control_vocab |= set(fxl_roles.keys())
```

Reemplazar la cadena `if token in overrides … elif token in self._lexicon … else …` por:

```python
            if token in overrides:
                roles[token] = overrides[token]
                meta[token] = {"source": "override", "ratio": None, "count": count}
            elif token in fxl_roles:
                roles[token] = fxl_roles[token]
                meta[token] = {"source": "fxl", "ratio": None, "count": count}
            elif token in self._lexicon:
                roles[token] = self._lexicon[token]
                meta[token] = {"source": "lexicon", "ratio": None, "count": count}
            else:
                role, ratio = self._infer_geom_role(token, seg_ratios)
                roles[token] = role
                meta[token] = {"source": "geometry", "ratio": ratio, "count": count}
```

- [ ] **Step 4: Thread `fxl_roles` through `detect_control_codes`**

Reemplazar la firma y la línea `fit` de `detect_control_codes` (líneas ~445-451):

```python
def detect_control_codes(points: list[dict], overrides: dict | None = None,
                         fxl_roles: dict | None = None) -> list[dict]:
    """Devuelve los control codes detectados con su rol y la fuente de la
    decisión: source ∈ ('override'|'fxl'|'lexicon'|'geometry')."""
    dialect = detect_dialect(points)
    model = dialect.fit(points, overrides, fxl_roles)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `/tmp/p2c_uv/bin/pytest tests/python/test_fxl_integration.py -v`
Expected: PASS (3 tests). También correr el resto: `/tmp/p2c_uv/bin/pytest tests/python -v` → sin regresiones.

- [ ] **Step 6: Commit**

```bash
git add python/field_codes.py tests/python/test_fxl_integration.py
git commit -m "feat(fxl): roles de control del FXL con prioridad sobre la heurística

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Tipos del FXL autoritativos en la clasificación

**Files:**
- Modify: `python/field_codes.py:366-442` (`classify_codes`, `linear_code_set`, `detect_codes`) + nuevo `closed_code_set`
- Test: `tests/python/test_fxl_integration.py` (añadir)

- [ ] **Step 1: Write the failing test**

Añadir a `tests/python/test_fxl_integration.py`:

```python
from field_codes import detect_codes, linear_code_set, closed_code_set  # noqa: E402

# "PT" aparece como puntos sueltos (heurística lo llamaría Punto).
PTS_PUNTOS = [
    {"codigo": "PT", "x": 0, "y": 0, "z": 0, "nombre": "1"},
    {"codigo": "PT", "x": 50, "y": 80, "z": 0, "nombre": "2"},
    {"codigo": "PT", "x": 120, "y": 10, "z": 0, "nombre": "3"},
]


def test_fxl_type_forces_line():
    summary = detect_codes(PTS_PUNTOS, fxl_types={"PT": "Línea abierta"})
    row = next(r for r in summary if r["codigo"] == "PT")
    assert row["tipo"] == "Línea abierta"


def test_fxl_type_forces_polygon():
    summary = detect_codes(PTS_PUNTOS, fxl_types={"PT": "Polilínea cerrada"})
    row = next(r for r in summary if r["codigo"] == "PT")
    assert row["tipo"] == "Polilínea cerrada"


def test_explicit_control_code_beats_fxl_type():
    # Datos con "fin" (end → línea); el FXL dice Punto, pero el control code manda.
    pts = [
        {"codigo": "AA", "x": 0, "y": 0, "z": 0, "nombre": "1"},
        {"codigo": "AA fin", "x": 10, "y": 0, "z": 0, "nombre": "2"},
    ]
    summary = detect_codes(pts, fxl_roles={"fin": "end"}, fxl_types={"AA": "Punto"})
    row = next(r for r in summary if r["codigo"] == "AA")
    assert row["tipo"] == "Línea abierta"


def test_linear_and_closed_sets_honor_fxl():
    assert "PT" in linear_code_set(PTS_PUNTOS, detect_dialect(PTS_PUNTOS),
                                   fxl_types={"PT": "Línea abierta"})
    assert "PT" in closed_code_set(PTS_PUNTOS, detect_dialect(PTS_PUNTOS),
                                   fxl_types={"PT": "Polilínea cerrada"})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/tmp/p2c_uv/bin/pytest tests/python/test_fxl_integration.py -v`
Expected: FAIL (`cannot import name 'closed_code_set'` / `detect_codes() got an unexpected keyword 'fxl_types'`).

- [ ] **Step 3: Add `has_control` + `fxl_types` to `classify_codes`**

Reemplazar `classify_codes` (líneas ~366-407) por esta versión (añade `fxl_types`, marca `has_control`, aplica FXL al final):

```python
def classify_codes(
    points: list[dict], dialect: CodingDialect, model: ControlCodeModel | None = None,
    overrides: dict | None = None, fxl_types: dict | None = None,
) -> tuple[dict, list]:
    """Agrupa los puntos por código base y acumula señales de geometría.

    Devuelve (info, order) donde info[base] = {count, is_line, is_closed,
    has_control, strings(set)}. `fxl_types` (código→tipo) es autoritativo sobre
    la heurística PERO no sobre un control code explícito presente en los datos
    (has_control)."""
    if model is None:
        model = dialect.fit(points, overrides)

    info: dict = {}
    order: list = []

    for pt in points:
        parsed = dialect.parse_field_code(pt.get("codigo") or "")
        base = parsed["base"]
        if not base:
            continue
        modifier = parsed["modifier"]

        if base not in info:
            info[base] = {"count": 0, "is_line": False, "is_closed": False,
                          "has_control": False, "strings": set()}
            order.append(base)

        i = info[base]
        i["count"] += 1
        if parsed["string"]:
            i["strings"].add(parsed["string"])

        if model.is_closed_shape(modifier):
            i["is_closed"] = True
            i["has_control"] = True
        elif modifier is not None and model.role(modifier) is not None:
            # cualquier otro rol reconocido (start/end/join/arc/smooth) → línea
            i["is_line"] = True
            i["has_control"] = True
        elif parsed["string"]:
            # Códigos con string number suelen ser líneas (convención Trimble)
            i["is_line"] = True

    # FXL: autoritativo sobre la heurística (string-number/geometría) pero no
    # sobre un control code explícito en los datos.
    fxl_types = fxl_types or {}
    for base, i in info.items():
        if i["has_control"]:
            continue
        tipo = fxl_types.get(base)
        if tipo == TIPO_POLIGONO:
            i["is_closed"], i["is_line"] = True, False
        elif tipo == TIPO_LINEA:
            i["is_line"], i["is_closed"] = True, False
        elif tipo == TIPO_PUNTO:
            i["is_line"], i["is_closed"] = False, False

    return info, order
```

- [ ] **Step 4: Add `fxl_types` to `linear_code_set` + new `closed_code_set`**

Reemplazar `linear_code_set` (líneas ~410-415) por:

```python
def linear_code_set(points: list[dict], dialect: CodingDialect,
                    model: ControlCodeModel | None = None,
                    fxl_types: dict | None = None) -> set:
    """Conjunto de códigos base que son línea o polígono (no punto)."""
    info, _ = classify_codes(points, dialect, model=model, fxl_types=fxl_types)
    return {base for base, i in info.items() if i["is_line"] or i["is_closed"]}


def closed_code_set(points: list[dict], dialect: CodingDialect,
                    model: ControlCodeModel | None = None,
                    fxl_types: dict | None = None) -> set:
    """Conjunto de códigos base que son polígono (línea cerrada). Lo usa
    build_geometry para cerrar cadenas FXL-poligonales sin terminador explícito."""
    info, _ = classify_codes(points, dialect, model=model, fxl_types=fxl_types)
    return {base for base, i in info.items() if i["is_closed"]}
```

- [ ] **Step 5: Add `fxl_roles`/`fxl_types` to `detect_codes`**

Reemplazar `detect_codes` (líneas ~418-442) por:

```python
def detect_codes(points: list[dict], overrides: dict | None = None,
                 fxl_roles: dict | None = None,
                 fxl_types: dict | None = None) -> list[dict]:
    """Clasifica cada código base para la UI: [{codigo, cantidad, tipo, cadenas}].
    El dialecto se autodetecta; prioridad usuario → FXL → heurística."""
    dialect = detect_dialect(points)
    model = dialect.fit(points, overrides, fxl_roles)
    info, order = classify_codes(points, dialect, model=model, fxl_types=fxl_types)

    result = []
    for base in order:
        i = info[base]
        if i["is_closed"]:
            tipo = TIPO_POLIGONO
        elif i["is_line"]:
            tipo = TIPO_LINEA
        else:
            tipo = TIPO_PUNTO
        result.append({
            "codigo": base,
            "cantidad": i["count"],
            "tipo": tipo,
            "cadenas": len(i["strings"]),
        })

    return result
```

- [ ] **Step 6: Run test to verify it passes**

Run: `/tmp/p2c_uv/bin/pytest tests/python/test_fxl_integration.py -v`
Expected: PASS. Correr todo Python: `/tmp/p2c_uv/bin/pytest tests/python -v` → sin regresiones.

- [ ] **Step 7: Commit**

```bash
git add python/field_codes.py tests/python/test_fxl_integration.py
git commit -m "feat(fxl): tipos del FXL autoritativos en la clasificación de códigos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `build_geometry` usa roles y tipos del FXL

**Files:**
- Modify: `python/geometry_builder.py:39-51` (firma + fit + sets), `python/geometry_builder.py:68-111` (`finalize`)
- Test: `tests/python/test_fxl_integration.py` (añadir)

- [ ] **Step 1: Write the failing test**

Añadir a `tests/python/test_fxl_integration.py`:

```python
import os as _os
import sys as _sys
_sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), "..", "..", "python"))
# build_geometry necesita el namespace de shapes + field_codes inyectado en Pyodide;
# en pytest local importamos las dependencias y las inyectamos en su módulo.
import field_codes as _fc  # noqa: E402
import shapes as _shapes  # noqa: E402
import geometry_builder as _gb  # noqa: E402

for _name in ("detect_dialect", "linear_code_set", "closed_code_set"):
    setattr(_gb, _name, getattr(_fc, _name))
for _name in ("circle_from_3_points", "circle_from_center_radius",
              "arc_from_3_points", "rectangle", "smooth_curve"):
    setattr(_gb, _name, getattr(_shapes, _name))
build_geometry = _gb.build_geometry

_TRI = [
    {"codigo": "ZONA", "x": 0, "y": 0, "z": 0, "nombre": "1"},
    {"codigo": "ZONA", "x": 10, "y": 0, "z": 0, "nombre": "2"},
    {"codigo": "ZONA", "x": 10, "y": 10, "z": 0, "nombre": "3"},
]


def test_fxl_polygon_type_emits_polyline_without_close_code():
    geom = build_geometry(_TRI, {}, fxl_types={"ZONA": "Polilínea cerrada"})
    assert len(geom["polylines"]) == 1
    assert len(geom["lines"]) == 0
    assert geom["polylines"][0]["codigo"] == "ZONA"


def test_fxl_line_type_emits_open_line():
    geom = build_geometry(_TRI, {}, fxl_types={"ZONA": "Línea abierta"})
    assert len(geom["lines"]) == 1
    assert len(geom["polylines"]) == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/tmp/p2c_uv/bin/pytest tests/python/test_fxl_integration.py -k fxl_polygon -v`
Expected: FAIL (`build_geometry() got an unexpected keyword 'fxl_types'`).

- [ ] **Step 3: Update `build_geometry` signature, fit and sets**

Reemplazar la firma de `build_geometry` (línea ~39) y el bloque fit/linear (líneas ~45-51):

```python
def build_geometry(points: list[dict], feature_library: dict,
                   control_overrides=None, dialect=None,
                   fxl_roles=None, fxl_types=None) -> dict:
    if dialect is None:
        dialect = detect_dialect(points)

    # Modelo de roles con prioridad usuario → FXL → heurística.
    model = dialect.fit(points, control_overrides, fxl_roles)

    # Códigos línea/polígono (auto-conexión) y polígonos (cierre implícito FXL).
    linear_codes = linear_code_set(points, dialect, model=model, fxl_types=fxl_types)
    closed_codes = closed_code_set(points, dialect, model=model, fxl_types=fxl_types)
```

- [ ] **Step 4: Make `finalize` close FXL polygons**

`finalize` se define dentro de `build_geometry`, así que `closed_codes` está en su clausura. Reemplazar las dos asignaciones de `to_poly` dentro de `finalize` (líneas ~102 y ~110):

Línea ~102 — cambiar:
```python
            to_poly = forced == "poly" or (forced is None and closing == "close")
```
por:
```python
            to_poly = (
                forced == "poly"
                or (forced is None and closing == "close")
                or (forced is None and closing is None and base in closed_codes)
            )
```

Línea ~110 — cambiar:
```python
            to_poly = forced == "poly" or (forced != "line" and closing == "close")
```
por:
```python
            to_poly = (
                forced == "poly"
                or (forced != "line" and closing == "close")
                or (forced != "line" and closing is None and base in closed_codes)
            )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `/tmp/p2c_uv/bin/pytest tests/python/test_fxl_integration.py -v`
Expected: PASS. Correr todo: `/tmp/p2c_uv/bin/pytest tests/python -v` → sin regresiones (geometry_builder ya existente sigue verde).

- [ ] **Step 6: Commit**

```bash
git add python/geometry_builder.py tests/python/test_fxl_integration.py
git commit -m "feat(fxl): build_geometry cierra polígonos y auto-conecta líneas según el FXL

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Estado, reducer y precedencia en `AppContext`

**Files:**
- Modify: `src/context/AppContext.jsx` (initialState ~29-69, `buildFeatureLibrary` ~16-26, acciones `SET_CODES_DETECTED` ~174-188, `UPDATE_FEATURE` ~199-209, `SET_CSV_PREVIEW` ~73-94; nuevas `LOAD_FXL`/`CLEAR_FXL`)
- Test: `src/context/AppContext.fxl.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// src/context/AppContext.fxl.test.js
import { describe, it, expect } from 'vitest'
import { reducer, initialState } from './AppContext'

const codesSummary = [
  { codigo: 'CERCA', cantidad: 3, tipo: 'Línea abierta', cadenas: 1 },
  { codigo: 'ARBOL', cantidad: 2, tipo: 'Punto', cadenas: 0 },
]

const fxl = {
  fileName: 'lib.fxl',
  features: {
    CERCA: { capa: 'CERCAS', color: '#00ff00', tipo: 'Línea abierta' },
    ARBOL: { capa: 'VEGETACION', color: '#000000', tipo: 'Punto' },
  },
  controlRoles: { fin: 'end' },
}

describe('FXL en el reducer', () => {
  it('LOAD_FXL aplica capa/color del FXL sobre los defaults de paleta', () => {
    let s = { ...initialState, codesSummary }
    s = reducer(s, { type: 'SET_CODES_DETECTED', payload: { codesSummary, controlCodes: [] } })
    s = reducer(s, { type: 'LOAD_FXL', payload: fxl })
    expect(s.fxl.fileName).toBe('lib.fxl')
    expect(s.featureLibrary.CERCA.capa).toBe('CERCAS')
    expect(s.featureLibrary.CERCA.color).toBe('#00ff00')
  })

  it('FXL no pisa una edición manual previa del usuario', () => {
    let s = reducer(initialState, {
      type: 'SET_CODES_DETECTED', payload: { codesSummary, controlCodes: [] },
    })
    // El usuario edita el color de CERCA a mano.
    s = reducer(s, { type: 'UPDATE_FEATURE', payload: { codigo: 'CERCA', changes: { color: '#123456' } } })
    expect(s.userEditedCodes).toContain('CERCA')
    s = reducer(s, { type: 'LOAD_FXL', payload: fxl })
    expect(s.featureLibrary.CERCA.color).toBe('#123456') // se conserva
    expect(s.featureLibrary.ARBOL.color).toBe('#000000')  // del FXL
  })

  it('cambiar visible NO marca el código como editado por el usuario', () => {
    let s = reducer(initialState, {
      type: 'SET_CODES_DETECTED', payload: { codesSummary, controlCodes: [] },
    })
    s = reducer(s, { type: 'UPDATE_FEATURE', payload: { codigo: 'CERCA', changes: { visible: false } } })
    expect(s.userEditedCodes).not.toContain('CERCA')
  })

  it('CLEAR_FXL revierte a paleta sin borrar ediciones manuales', () => {
    let s = reducer(initialState, {
      type: 'SET_CODES_DETECTED', payload: { codesSummary, controlCodes: [] },
    })
    s = reducer(s, { type: 'UPDATE_FEATURE', payload: { codigo: 'CERCA', changes: { capa: 'MIA' } } })
    s = reducer(s, { type: 'LOAD_FXL', payload: fxl })
    s = reducer(s, { type: 'CLEAR_FXL' })
    expect(s.fxl).toBeNull()
    expect(s.featureLibrary.CERCA.capa).toBe('MIA') // edición manual sobrevive
    expect(s.featureLibrary.ARBOL.capa).toBe('ARBOL') // vuelve al default
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/context/AppContext.fxl.test.js`
Expected: FAIL (`s.fxl` undefined / acción `LOAD_FXL` no manejada).

- [ ] **Step 3: Extend `buildFeatureLibrary` + initialState**

En `src/context/AppContext.jsx`, reemplazar `buildFeatureLibrary` (líneas ~16-26):

```javascript
// Construye la featureLibrary con precedencia: edición manual del usuario
// (userEditedCodes) → FXL (fxl.features) → paleta/código por defecto.
const buildFeatureLibrary = (codesSummary, existing = {}, fxl = null, userEditedCodes = []) => {
  const defaults = assignColors(codesSummary)
  const lib = {}
  for (const { codigo } of codesSummary) {
    const userEdited = userEditedCodes.includes(codigo)
    if (userEdited && existing[codigo]) {
      lib[codigo] = existing[codigo]
      continue
    }
    const fxlFeature = fxl?.features?.[codigo]
    if (fxlFeature) {
      lib[codigo] = {
        color: fxlFeature.color ?? defaults[codigo].color,
        capa: fxlFeature.capa ?? codigo,
        ...(existing[codigo]?.visible !== undefined
          ? { visible: existing[codigo].visible }
          : {}),
      }
      continue
    }
    lib[codigo] = existing[codigo] ?? defaults[codigo]
  }
  return lib
}
```

En `initialState` (tras `featureLibrary: {}`, línea ~50), añadir:

```javascript
  // Biblioteca FXL importada (opcional): { fileName, features, controlRoles } | null.
  fxl: null,
  // Códigos cuyo color/capa editó el usuario a mano (el FXL no los pisa).
  userEditedCodes: [],
```

- [ ] **Step 4: Wire FXL into actions**

En `SET_CODES_DETECTED` (línea ~181), cambiar:
```javascript
        featureLibrary: buildFeatureLibrary(codesSummary, state.featureLibrary),
```
por:
```javascript
        featureLibrary: buildFeatureLibrary(
          codesSummary, state.featureLibrary, state.fxl, state.userEditedCodes,
        ),
```

Reemplazar `UPDATE_FEATURE` (líneas ~199-209) por (marca edición manual solo si cambia color/capa):

```javascript
    case 'UPDATE_FEATURE': {
      const { codigo, changes } = action.payload
      const isManualEdit = 'color' in changes || 'capa' in changes
      return {
        ...state,
        featureLibrary: {
          ...state.featureLibrary,
          [codigo]: { ...state.featureLibrary[codigo], ...changes },
        },
        userEditedCodes:
          isManualEdit && !state.userEditedCodes.includes(codigo)
            ? [...state.userEditedCodes, codigo]
            : state.userEditedCodes,
      }
    }
```

Añadir las dos acciones nuevas (junto a las demás, p. ej. tras `UPDATE_FEATURE`):

```javascript
    case 'LOAD_FXL':
      return {
        ...state,
        fxl: action.payload,
        featureLibrary: buildFeatureLibrary(
          state.codesSummary, state.featureLibrary, action.payload, state.userEditedCodes,
        ),
        error: null,
      }

    case 'CLEAR_FXL':
      return {
        ...state,
        fxl: null,
        featureLibrary: buildFeatureLibrary(
          state.codesSummary, state.featureLibrary, null, state.userEditedCodes,
        ),
      }
```

En `SET_CSV_PREVIEW` (líneas ~85-92), resetear las ediciones manuales del archivo anterior (el FXL se conserva, es independiente del CSV). Añadir dentro del objeto devuelto:
```javascript
        userEditedCodes: [],
```
(No añadir `fxl: null`: la biblioteca persiste entre archivos.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/context/AppContext.fxl.test.js`
Expected: PASS (4 tests). Y `npx vitest run src/context/AppContext.reducer.test.js` sin regresiones.

- [ ] **Step 6: Commit**

```bash
git add src/context/AppContext.jsx src/context/AppContext.fxl.test.js
git commit -m "feat(fxl): estado, precedencia y acciones LOAD_FXL/CLEAR_FXL en el reducer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Persistencia de sesión

**Files:**
- Modify: `src/utils/sessionStorage.js:10-22` (PERSISTED_FIELDS), `src/context/AppContext.jsx` (RESTORE/rehidratación de `fxl`/`userEditedCodes`)

- [ ] **Step 1: Add fields to PERSISTED_FIELDS**

En `src/utils/sessionStorage.js`, añadir al array `PERSISTED_FIELDS` (tras `'controlOverrides',`):

```javascript
  'fxl',
  'userEditedCodes',
```

- [ ] **Step 2: Rehydrate in RESTORE_SESSION**

En `src/context/AppContext.jsx`, en el `case 'RESTORE_SESSION'` (alrededor de la línea ~288 donde se restaura `featureLibrary`/`controlOverrides`), añadir:

```javascript
        fxl: saved.fxl ?? null,
        userEditedCodes: saved.userEditedCodes ?? [],
```

- [ ] **Step 3: Verify build + existing tests**

Run: `npx vitest run && npm run build`
Expected: PASS y build sin errores (cambio aditivo, sin tests nuevos: la persistencia se valida en el flujo E2E del Task 9).

- [ ] **Step 4: Commit**

```bash
git add src/utils/sessionStorage.js src/context/AppContext.jsx
git commit -m "feat(fxl): persistir fxl y userEditedCodes en la sesión

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Puente Python — `parseFxl` + inyección de hints

**Files:**
- Modify: `src/hooks/usePythonBridge.js` (imports ~5-12, hook ~49-51, `detectCodes` ~53-102, `processCSV` ~104-147, return ~191; nueva `parseFxl`)

- [ ] **Step 1: Import the parser source and read state**

En `src/hooks/usePythonBridge.js`, añadir tras la línea 12 de imports:

```javascript
import fxlParserCode from '../../python/fxl_parser.py?raw'
```

Cambiar la línea ~51 de:
```javascript
  const { dispatch } = useApp()
```
a:
```javascript
  const { state, dispatch } = useApp()

  // Hints del FXL para Python: roles (token→rol) y tipos (código→tipo). El color
  // NO viaja a Python (solo se usa en JS para la featureLibrary). Sin FXL → vacío.
  const fxlHints = state.fxl
    ? {
        control_roles: state.fxl.controlRoles ?? {},
        feature_types: Object.fromEntries(
          Object.entries(state.fxl.features ?? {}).map(([c, f]) => [c, f.tipo]),
        ),
      }
    : { control_roles: {}, feature_types: {} }
```

- [ ] **Step 2: Inject hints into `detectCodes`**

Reemplazar el bloque `const code = ...` de `detectCodes` (líneas ~59-71) por:

```javascript
      const code = `
import json as _json

${csvParserCode}
${fieldCodesCode}

csv_text = _json.loads(${JSON.stringify(JSON.stringify(csvText))})
overrides = _json.loads(${JSON.stringify(JSON.stringify(controlOverrides))})
fxl_roles = _json.loads(${JSON.stringify(JSON.stringify(fxlHints.control_roles))})
fxl_types = _json.loads(${JSON.stringify(JSON.stringify(fxlHints.feature_types))})
points_raw = parse_csv(csv_text)
codes = detect_codes(points_raw, overrides, fxl_roles, fxl_types)
control_codes = detect_control_codes(points_raw, overrides, fxl_roles)
print(_json.dumps({"type": "codes", "data": {"summary": codes, "controlCodes": control_codes}}))
`
```

Añadir `fxlHints` a las deps del `useCallback` de `detectCodes` (línea ~101): `[runPython, dispatch, fxlHints]`.

- [ ] **Step 3: Inject hints into `processCSV`**

Reemplazar el bloque `const code = ...` de `processCSV` (líneas ~108-125) por:

```javascript
      const code = `
import json as _json

# Biblioteca de características definida por el usuario desde JS
FEATURE_LIBRARY = _json.loads(${JSON.stringify(JSON.stringify(featureLibrary))})
CONTROL_OVERRIDES = _json.loads(${JSON.stringify(JSON.stringify(controlOverrides))})
FXL_ROLES = _json.loads(${JSON.stringify(JSON.stringify(fxlHints.control_roles))})
FXL_TYPES = _json.loads(${JSON.stringify(JSON.stringify(fxlHints.feature_types))})

${csvParserCode}
${fieldCodesCode}
${shapesCode}
${geometryBuilderCode}

csv_text = _json.loads(${JSON.stringify(JSON.stringify(csvText))})
points_raw = parse_csv(csv_text)
geometry = build_geometry(points_raw, FEATURE_LIBRARY, CONTROL_OVERRIDES, fxl_roles=FXL_ROLES, fxl_types=FXL_TYPES)

print(_json.dumps({"type": "geometry", "data": geometry}))
`
```

Añadir `fxlHints` a las deps del `useCallback` de `processCSV` (línea ~146): `[runPython, dispatch, fxlHints]`.

- [ ] **Step 4: Add `parseFxl` and export it**

Añadir esta función dentro del hook (antes del `return`):

```javascript
  // Parsea un .fxl (XML) en Python y devuelve { features, control_roles }.
  // Lanza Error con el mensaje de Python si el XML es inválido.
  const parseFxl = useCallback(
    async (xmlText) => {
      const code = `
import json as _json

${fxlParserCode}

xml_text = _json.loads(${'${JSON.stringify(JSON.stringify(xmlText))}'})
result = parse_fxl(xml_text)
print(_json.dumps({"type": "fxl", "data": result}))
`.replace('${JSON.stringify(JSON.stringify(xmlText))}', JSON.stringify(JSON.stringify(xmlText)))
      const { stdout, stderr } = await runPython(code)
      if (stderr) throw new Error(stderr)
      for (const line of stdout.split('\n').filter(Boolean)) {
        try {
          const result = JSON.parse(line)
          if (result.type === 'fxl') return result.data
        } catch {
          // línea no-JSON, ignorar
        }
      }
      throw new Error('No se pudo parsear el FXL')
    },
    [runPython],
  )
```

> Nota para el implementador: el patrón del repo inyecta `xmlText` con
> `${JSON.stringify(JSON.stringify(xmlText))}` directamente dentro del template
> literal (como en `detectCodes`). Escribe esa interpolación de forma literal
> igual que los demás; el `.replace(...)` de arriba es solo para que este
> documento no rompa el bloque de código. Resultado equivalente a:
> `xml_text = _json.loads(${JSON.stringify(JSON.stringify(xmlText))})`.

Cambiar el `return` (línea ~191) a:
```javascript
  return { detectCodes, processCSV, exportGeometry, parseFxl, isLoading, isRunning }
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: build sin errores. (La funcionalidad se valida en Task 8/9.)

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePythonBridge.js
git commit -m "feat(fxl): parseFxl e inyección de roles/tipos del FXL en detect/process

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Hook `useFxlLoader`

**Files:**
- Create: `src/hooks/useFxlLoader.js`
- Test: `src/hooks/useFxlLoader.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// src/hooks/useFxlLoader.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFxlLoader } from './useFxlLoader'
import { useApp } from '../context/AppContext'
import { usePythonBridge } from './usePythonBridge'

vi.mock('../context/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('./usePythonBridge', () => ({ usePythonBridge: vi.fn() }))

const dispatch = vi.fn()
const parseFxl = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  useApp.mockReturnValue({ dispatch })
  usePythonBridge.mockReturnValue({ parseFxl })
})

function fakeFile(text, name = 'lib.fxl') {
  return { name, text: () => Promise.resolve(text) }
}

describe('useFxlLoader', () => {
  it('parsea y despacha LOAD_FXL con el nombre del archivo', async () => {
    parseFxl.mockResolvedValue({
      features: { A: { capa: 'X', color: '#fff', tipo: 'Punto' } },
      control_roles: { fin: 'end' },
    })
    const { result } = renderHook(() => useFxlLoader())
    await act(async () => { await result.current.loadFxl(fakeFile('<xml/>', 'mi.fxl')) })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'LOAD_FXL',
      payload: {
        fileName: 'mi.fxl',
        features: { A: { capa: 'X', color: '#fff', tipo: 'Punto' } },
        controlRoles: { fin: 'end' },
      },
    })
  })

  it('reporta error y NO despacha LOAD_FXL si el parseo falla', async () => {
    parseFxl.mockRejectedValue(new Error('FXL no es XML válido'))
    const { result } = renderHook(() => useFxlLoader())
    let err
    await act(async () => { err = await result.current.loadFxl(fakeFile('basura')) })
    expect(err).toMatch(/FXL/)
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'LOAD_FXL' }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useFxlLoader.test.js`
Expected: FAIL (`Failed to resolve import './useFxlLoader'`).

- [ ] **Step 3: Implement the hook**

```javascript
// src/hooks/useFxlLoader.js
import { useCallback, useState } from 'react'
import { useApp } from '../context/AppContext'
import { usePythonBridge } from './usePythonBridge'

// Lee un archivo .fxl, lo parsea en Python (parseFxl) y despacha LOAD_FXL.
// Devuelve un mensaje de error (string) si algo falla, o null si fue bien.
export function useFxlLoader() {
  const { dispatch } = useApp()
  const { parseFxl } = usePythonBridge()
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const loadFxl = useCallback(
    async (file) => {
      if (!file) return null
      setLoading(true)
      setError(null)
      try {
        const xmlText = await file.text()
        const parsed = await parseFxl(xmlText)
        const codes = Object.keys(parsed.features ?? {}).length
        const ctrls = Object.keys(parsed.control_roles ?? {}).length
        if (codes === 0 && ctrls === 0) {
          const msg = 'El FXL no contiene códigos reconocibles'
          setError(msg)
          return msg
        }
        dispatch({
          type: 'LOAD_FXL',
          payload: {
            fileName: file.name,
            features: parsed.features ?? {},
            controlRoles: parsed.control_roles ?? {},
          },
        })
        return null
      } catch (err) {
        const msg = `No se pudo leer el FXL: ${err.message}`
        setError(msg)
        return msg
      } finally {
        setLoading(false)
      }
    },
    [dispatch, parseFxl],
  )

  return { loadFxl, error, loading }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useFxlLoader.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useFxlLoader.js src/hooks/useFxlLoader.test.js
git commit -m "feat(fxl): hook useFxlLoader (lee archivo, parsea, despacha LOAD_FXL)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: UI en CSVPreview + indicador de origen FXL

**Files:**
- Create: `src/components/FxlImport/FxlImport.jsx`
- Modify: `src/components/CSVPreview/CSVPreview.jsx` (import + render del bloque cerca de la sección de códigos)
- Test: `src/components/FxlImport/FxlImport.test.jsx`

- [ ] **Step 1: Write the failing test**

```javascript
// src/components/FxlImport/FxlImport.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import FxlImport from './FxlImport'
import { useApp } from '../../context/AppContext'
import { useFxlLoader } from '../../hooks/useFxlLoader'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../hooks/useFxlLoader', () => ({ useFxlLoader: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  useFxlLoader.mockReturnValue({ loadFxl: vi.fn(), error: null, loading: false })
})

describe('FxlImport', () => {
  it('ofrece cargar una biblioteca cuando no hay FXL', () => {
    useApp.mockReturnValue({ state: { fxl: null }, dispatch: vi.fn() })
    render(<FxlImport />)
    expect(screen.getByText(/biblioteca de características/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /importar .*\.fxl/i })).toBeInTheDocument()
  })

  it('muestra el resumen y el botón Quitar cuando hay FXL', () => {
    useApp.mockReturnValue({
      state: {
        fxl: {
          fileName: 'lib.fxl',
          features: { A: {}, B: {} },
          controlRoles: { fin: 'end' },
        },
      },
      dispatch: vi.fn(),
    })
    render(<FxlImport />)
    expect(screen.getByText(/lib\.fxl/)).toBeInTheDocument()
    expect(screen.getByText(/2 códigos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /quitar/i })).toBeInTheDocument()
  })

  it('muestra el error de carga', () => {
    useApp.mockReturnValue({ state: { fxl: null }, dispatch: vi.fn() })
    useFxlLoader.mockReturnValue({
      loadFxl: vi.fn(), error: 'No se pudo leer el FXL: x', loading: false,
    })
    render(<FxlImport />)
    expect(screen.getByText(/no se pudo leer el fxl/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/FxlImport/FxlImport.test.jsx`
Expected: FAIL (`Failed to resolve import './FxlImport'`).

- [ ] **Step 3: Implement the component**

```javascript
// src/components/FxlImport/FxlImport.jsx
import { useRef } from 'react'
import { useApp } from '../../context/AppContext'
import { useFxlLoader } from '../../hooks/useFxlLoader'

// Bloque opcional (en la etapa de importación) para cargar una biblioteca de
// características Trimble (.fxl) que aporta el usuario. Siembra capa/color/tipo y
// roles de control con prioridad sobre la heurística (no sobre ediciones manuales).
export default function FxlImport() {
  const { state, dispatch } = useApp()
  const { loadFxl, error, loading } = useFxlLoader()
  const inputRef = useRef(null)
  const fxl = state.fxl

  async function handleChange(e) {
    const file = e.target.files[0]
    await loadFxl(file)
    if (inputRef.current) inputRef.current.value = ''
  }

  const codeCount = fxl ? Object.keys(fxl.features ?? {}).length : 0
  const ctrlCount = fxl ? Object.keys(fxl.controlRoles ?? {}).length : 0

  return (
    <section className="flex flex-col gap-1 text-xs">
      <h3 className="text-sm font-semibold text-gray-300">
        Biblioteca de características (.fxl)
      </h3>

      {fxl ? (
        <div className="flex items-center gap-2 bg-gray-800 rounded px-2 py-1.5">
          <span className="text-gray-200 truncate">{fxl.fileName}</span>
          <span className="text-gray-500">
            · {codeCount} códigos · {ctrlCount} control codes
          </span>
          <button
            onClick={() => dispatch({ type: 'CLEAR_FXL' })}
            className="ml-auto text-gray-400 hover:text-white"
          >
            Quitar
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current.click()}
          disabled={loading}
          className="w-full py-1.5 px-2 rounded border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white disabled:opacity-50 transition-colors"
        >
          {loading ? 'Leyendo .fxl…' : 'Importar biblioteca (.fxl) — opcional'}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".fxl"
        onChange={handleChange}
        className="hidden"
      />

      {error && <p className="text-red-400">{error}</p>}
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/FxlImport/FxlImport.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Mount `FxlImport` in CSVPreview**

En `src/components/CSVPreview/CSVPreview.jsx`, añadir el import al inicio (junto a los demás imports de componentes, p. ej. tras la línea 8 `import ColorPicker ...`):

```javascript
import FxlImport from '../FxlImport/FxlImport'
```

Renderizar el bloque justo **antes** de la sección "Códigos de control" (alrededor de la línea ~784, donde empieza `{state.controlCodes.length > 0 && (`). Insertar en el JSX, antes de ese bloque:

```jsx
      <div className="mb-3">
        <FxlImport />
      </div>
```

> Si el implementador prefiere ubicarlo junto a la tabla de códigos detectados
> en lugar de antes de los control codes, es aceptable mientras quede dentro de
> la etapa de importación (CSVPreview) y visible tras detectar códigos.

- [ ] **Step 6: Add an "FXL" source indicator on code rows**

En la tabla de códigos detectados de `CSVPreview` (donde se renderiza cada `codigo` con su `ColorPicker`/capa, alrededor de las líneas ~881-899), añadir una etiqueta cuando el código provenga del FXL. Junto al nombre del código, insertar:

```jsx
{state.fxl?.features?.[codigo] && (
  <span className="ml-1 text-[10px] uppercase tracking-wide text-emerald-400 border border-emerald-700 rounded px-1">
    FXL
  </span>
)}
```

> El implementador debe localizar el elemento que muestra el `codigo` en esa fila
> (es un `<span>`/celda dentro del `.map` de códigos) y colocar la etiqueta a su
> lado. No cambia ninguna lógica, solo es indicativo visual.

- [ ] **Step 7: Verify build + full test suite**

Run: `npx vitest run && npm run build`
Expected: toda la suite en verde y build sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/components/FxlImport/ src/components/CSVPreview/CSVPreview.jsx
git commit -m "feat(fxl): UI de importación de biblioteca .fxl en la vista previa del CSV

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Verificación end-to-end y cierre

**Files:** ninguno (verificación).

- [ ] **Step 1: Full Python suite**

Run: `/tmp/p2c_uv/bin/pytest tests/python -v`
Expected: todos verdes (parser + integración + generadores existentes).

- [ ] **Step 2: Full JS suite + build**

Run: `npx vitest run && npm run build`
Expected: todos verdes, build sin errores.

- [ ] **Step 3: Smoke E2E manual (opcional pero recomendado)**

Run: `npm run dev` y, con un CSV de `docs/` en modo proyectado/geodésico:
1. Importar el CSV, detectar códigos.
2. Importar `docs/geologia.fxl` (FXL de autoría del usuario) con el botón nuevo.
3. Verificar: el resumen muestra el archivo + nº de códigos; las filas de códigos presentes en el FXL llevan la etiqueta "FXL" y toman su capa/color; un código declarado Line/Polygon en el FXL se procesa como línea/polígono.
4. Editar a mano el color de un código del FXL → recargar el FXL → el color editado se conserva.
5. "Quitar" → vuelve a paleta/heurística sin perder la edición manual.

- [ ] **Step 4: Final review against spec**

Repasar `docs/superpowers/specs/2026-06-09-fxl-import-design.md` sección a sección y confirmar cobertura. Marcar el plan como completado.

---

## Self-Review (autor del plan)

**Cobertura del spec:**
- §4 modelo de datos (`fxl`, `userEditedCodes`) → Task 5. ✓
- §5 precedencia color/capa → Task 5 (`buildFeatureLibrary` + `UPDATE_FEATURE`); rol de control → Task 2; tipo → Task 3/4. ✓
- §6 flujo (CSV→FXL y FXL→CSV; `CLEAR_FXL`) → Task 5 (`LOAD_FXL` reconstruye; `SET_CODES_DETECTED` usa FXL); persistencia → Task 6. ✓
  - Nota: el re-disparo de detección al cargar FXL después del CSV se logra porque `LOAD_FXL` reconstruye `featureLibrary`; los tipos/roles afectan a la geometría en el siguiente `processCSV`, que ya lee `state.fxl` (Task 7). La UI de detección refleja tipos vía `detect_codes`, que también recibe hints (Task 7). ✓
- §7 parser Python → Task 1; `field_codes` → Task 2/3; puente → Task 7. ✓
- §8 UI en CSVPreview + hook → Task 8/9. ✓
- §9 errores (XML inválido → ValueError → Error JS; FXL vacío; Pyodide) → Task 1 (ValueError), Task 8 (mensajes y FXL vacío). ✓
- §10 testing (pytest parser/field_codes; vitest reducer/componente; build) → Tasks 1-9. ✓

**Placeholder scan:** sin TBD/TODO. La única indirección es el template literal de `parseFxl` (Task 7, Step 4) — documentada con nota explícita y equivalente literal.

**Type consistency:** `fxl_roles`/`fxl_types` (Python) y `controlRoles`/`features[].tipo` (JS) consistentes entre Tasks 1/2/3/4/5/7; `parse_fxl` devuelve `{features, control_roles}` y el hook lo mapea a `{fileName, features, controlRoles}` (Task 8) — coherente con el reducer (Task 5). Literales de tipo `"Punto"/"Línea abierta"/"Polilínea cerrada"` idénticos en `fxl_parser.py`, `field_codes.py` y los tests.
