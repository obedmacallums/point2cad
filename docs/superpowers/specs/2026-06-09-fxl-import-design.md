# Diseño: Importar biblioteca de características Trimble (.fxl)

> Fecha: 2026-06-09
> Estado: aprobado (brainstorming) — pendiente de plan de implementación.

## 1. Objetivo

Permitir, de forma **opcional**, cargar un archivo `.fxl` (Trimble Feature
Library) en la etapa de importación, junto a la vista previa del CSV, para
sembrar de forma autoritativa la configuración que hoy se **adivina**
heurísticamente:

- **código → capa** (hoy: por defecto el propio código).
- **código → color** (hoy: paleta cíclica).
- **código → tipo** punto / línea abierta / polilínea cerrada (hoy: heurística).
- **control code (texto) → rol** start/end/close/join/circle/arc/rect/smooth
  (hoy: léxico + geometría).

El FXL es un archivo XML que aporta el propio usuario. No se redistribuye ningún
FXL de Trimble ni su esquema; el parser se escribe por observación de archivos
reales (interoperabilidad estándar). Investigación de respaldo en
`docs/trimble-feature-library-fxl.md`.

## 2. Alcance

**Dentro:** código→capa, código→color, código→tipo (las 3 entidades del
proyecto: punto / línea abierta / polilínea cerrada) y control codes (texto→rol).

**Fuera (YAGNI):** símbolos, atributos, etiquetado automático, estilos de línea,
offsets y bloques. La app no dibuja símbolos ni usa atributos en ningún formato
de salida.

## 3. Enfoque

Enfoque A (aprobado): **el FXL se parsea en Python** (`fxl_parser.py`), una sola
vez al cargar. Se mantiene la convención del proyecto: Python procesa, JS solo
transporta información.

- El **color/capa** vive solo en JS (alimenta `featureLibrary`).
- Los **roles de control y los tipos** se vuelven a pasar a Python en cada
  detección/proceso como *hints*; Python sigue siendo quien clasifica y construye
  la geometría.

## 4. Modelo de datos (estado en `AppContext`)

```
state.fxl = {
  fileName,                                   // "BIBLIO_GEO_2022.fxl"
  features: { CODIGO: { capa, color, tipo } },// color = "#RRGGBB" (uso JS)
  controlRoles: { token_lower: rol }          // texto de campo → rol
} | null

state.userEditedCodes = []   // códigos cuyo color/capa tocó el usuario a mano
```

`controlOverrides` se mantiene intacto como "capa del usuario": NO se mezcla con
los roles del FXL.

`state.fxl` y `state.userEditedCodes` se **persisten en sesión**
(`sessionStorage`) y se rehidratan, igual que el resto del estado.

## 5. Precedencia

De mayor a menor autoridad:

| Dato | 1.º (gana) | 2.º | 3.º |
|---|---|---|---|
| color / capa | edición manual (`userEditedCodes`) | FXL `features` | paleta cíclica / código |
| rol de control | `controlOverrides` (usuario) | FXL `controlRoles` | léxico + geometría |
| tipo (P/L/Pol) | control codes que implique el usuario | FXL `features[].tipo` | heurística |

Regla rectora acordada: **"FXL manda sobre la heurística, no sobre ti"** (las
ediciones manuales del usuario nunca se pisan al cargar/recargar un FXL).

## 6. Flujo

Dos órdenes posibles, mismo helper `buildFeatureLibrary`:

- **CSV → luego FXL:** la acción `LOAD_FXL` reconstruye `featureLibrary` con
  `buildFeatureLibrary(codesSummary, existing, fxl, userEditedCodes)` y
  **re-dispara la detección** (igual que hoy hace un cambio de rol de control),
  para que tipos/roles del FXL afecten a la geometría.
- **FXL → luego CSV:** al detectar, `buildFeatureLibrary` ya usa el FXL como
  default (en vez de paleta) y la detección recibe los *hints*.

`CLEAR_FXL` revierte a heurística/paleta **sin** borrar las ediciones manuales
(`userEditedCodes`).

## 7. Lado Python

### 7.1 Nuevo módulo `python/fxl_parser.py`

Parseo puro con `xml.etree.ElementTree` (stdlib, disponible en Pyodide):

```
parse_fxl(xml_text: str) -> {
  "features": { CODIGO: {capa, color, tipo} },
  "control_roles": { token_lower: rol }
}
```

Reglas (verificadas contra los FXL del repo):

- Namespace raíz `http://trimble.com/schema/fxl` (búsqueda con namespace).
- `PointFeatureDefinition` → `tipo = "Punto"`;
  `LineFeatureDefinition` → `"Línea abierta"`;
  `PolygonFeatureDefinition` → `"Polilínea cerrada"`
  (reutiliza los literales `TIPO_PUNTO/TIPO_LINEA/TIPO_POLIGONO` de
  `field_codes.py`).
- **capa** = atributo `Layer`; si es `"0"`, vacío o ausente → `None` (JS cae al
  nombre del código, comportamiento actual).
- **color** = atributo `Color` en ARGB hex de 8 dígitos → se descarta el alfa y
  se normaliza a `#RRGGBB` (`FE000000` → `#000000`). Si el feature no trae
  `Color`, se intenta el color de su capa (`LayerDefinitions` → `{Name: Color}`);
  si tampoco, `None` (JS cae a paleta).
- `ControlCodeDefinitions`: cada `<ControlCodeDefinition Code="fin" Type="End"/>`
  → `control_roles["fin"] = ROLE_END`. Mapeo `Type → rol`:
  `Start→start, End→end, Close→close, Join→join`, y de forma
  `Smooth→smooth, Arc/StartArc→arc, Rectangle→rect, Circle→circle`.
  Tipos desconocidos se ignoran (robustez ante esquemas nuevos).

### 7.2 Cambios en `field_codes.py`

- `ControlCodeModel.fit(points, overrides=None, fxl_roles=None)`: nueva fuente
  `fxl_roles` con prioridad **bajo** los `overrides` del usuario y **sobre** el
  léxico/geometría. Orden resultante: usuario → FXL → `KNOWN_ALIASES` →
  estructura/geometría.
- Clasificación punto/línea/polígono: aceptar `fxl_feature_types` (código→tipo)
  como **autoritativo** para decidir si un código es lineal/poligonal/puntual,
  por encima de la heurística (pero los control codes del usuario siguen
  mandando).

### 7.3 Puente `usePythonBridge.js`

- Nueva función `parseFxl(xml_text)` → invoca `parse_fxl` y devuelve el dict.
- `detectCodes` y `processCSV` aceptan y pasan a Python un
  `fxl_hints = { control_roles, feature_types }` derivado de `state.fxl` (sin
  color; el color no viaja a Python). Sin FXL → se pasa vacío y el comportamiento
  es idéntico al actual.

## 8. UI (en `CSVPreview`)

- Control opcional *"Importar biblioteca de características (.fxl)"* cerca de la
  sección de códigos. Botón discreto + `<input type="file" accept=".fxl">` oculto
  (mismo patrón que `FileUpload`).
- Al elegir archivo: se lee el texto, se parsea en Python y se despacha
  `LOAD_FXL`.
- Feedback en el mismo bloque:
  - OK → *"Biblioteca: <archivo> · N códigos · M control codes"* + botón "Quitar"
    (→ `CLEAR_FXL`).
  - Indicador visual sutil (etiqueta "FXL") en las filas de código cuyo
    color/capa/rol vino de la biblioteca, para distinguirlo de la heurística.
- **Nuevo hook `useFxlLoader`** (espejo de `useCSVLoader`): lee el archivo, llama
  a `parseFxl`, despacha `LOAD_FXL` o el error.

## 9. Manejo de errores

- XML inválido / no es un FXL → `parse_fxl` lanza `ValueError`; el hook captura y
  muestra *"No se pudo leer el FXL: …"* en el bloque, **sin** alterar el estado.
- FXL válido pero sin `FeatureDefinitions` ni control codes → aviso *"El FXL no
  contiene códigos reconocibles"*; no cambia nada.
- Códigos del FXL que no están en el CSV → se ignoran. Códigos del CSV ausentes
  del FXL → heurística/paleta, como hoy.
- Pyodide no listo aún → el botón espera/deshabilita igual que el flujo de
  detección.

## 10. Testing

- **pytest `tests/python/test_fxl_parser.py`**: contra un **FXL sintético propio**
  (fixture XML mínimo escrito por nosotros, no muestras de Trimble) — verifica
  mapeo tipo P/L/Pol, conversión ARGB→`#RRGGBB`, `Layer="0"`→`None`, fallback de
  color por capa, y `Type→rol` de control codes. Más un test de `ValueError` con
  XML basura. *(Opcional: smoke-test contra `docs/geologia.fxl`, de autoría del
  usuario.)*
- **pytest `field_codes`**: prioridad — un `fxl_roles` que reclasifica un token
  gana a la heurística pero pierde ante un override del usuario; y
  `fxl_feature_types` fuerza que un código se trate como línea/polígono.
- **vitest reducer**: `LOAD_FXL` aplica color/capa del FXL sobre defaults de
  paleta, **respeta** `userEditedCodes`; `CLEAR_FXL` revierte sin borrar
  ediciones manuales. `buildFeatureLibrary` con FXL.
- **vitest componente**: el bloque FXL en `CSVPreview` renderiza, parsea un FXL de
  prueba (mock de `parseFxl`) y refleja el estado cargado/erróneo.
- **build**: `npm run build` sin errores.

## 11. Consideraciones legales

Leer/parsear archivos `.fxl` que aporta el usuario es interoperabilidad estándar
y legal: los formatos de archivo no son protegibles por copyright, el FXL no está
cifrado (sin elusión DMCA) y no se descompila software de Trimble. Restricciones
respetadas: (a) no redistribuir `GlobalFeatures.fxl` ni FXL de Trimble en el
repo; (b) no copiar el XSD/documentación de Trimble; (c) no usar la marca Trimble
de forma que sugiera respaldo. Tests con fixtures propios.

## 12. Fuera de alcance

- Símbolos, atributos, etiquetado automático, estilos/pesos de línea, offsets y
  bloques.
- Edición/exportación de FXL (solo lectura/importación).
