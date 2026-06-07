# Diseño: desactivar filas en el import + fix del crash por header vacío

Fecha: 2026-06-05

## Contexto y motivación

Al importar `docs/obed0506.csv` la app se queda en **pantalla en blanco, sin
feedback**. Investigación (reproducida de forma aislada):

- El CSV no tiene fila de cabecera y su primera fila termina en coma (campo de
  código vacío): `Pt30,...,601.53...,`.
- El default de la app es `hasHeader: true`, así que PapaParse toma esa primera
  fila como cabecera → `csvHeaders = ["Pt30", "-33.44…", "-70.62…", "601.5…", ""]`.
  El último header es **cadena vacía `""`**.
- En `CSVPreview.jsx`, `previewColumns` crea una columna por header con
  `colHelper.accessor(h, { header: () => (...) })`. Con `h === ""`, TanStack
  Table genera un `id` falsy y, al ser el `header` una función (no string),
  **lanza** `Columns require an id when using a non-string header` durante el
  render de la vista por defecto (`appMode: 'preview'`). No hay Error Boundary →
  React desmonta todo → pantalla en blanco.

El pipeline de Python y el parseo JS por separado NO crashean (probado: 28
puntos, 0 errores). El crash es puramente de render en la tabla de preview.

Aparte del crash, el usuario pidió poder **descartar filas irrelevantes antes de
mapear** (es común que los archivos traigan filas basura). Las columnas no
necesitan un control de exclusión: al no mapearlas ya quedan fuera del proceso
(`buildCanonicalCSV` solo toma las columnas mapeadas).

## Alcance

Dos partes. La Parte 1 es prerrequisito de la Parte 2: el crash ocurre al
renderizar la tabla, antes de que el usuario pueda interactuar con ninguna fila.

### Parte 1 — Fix del crash (saneo de cabeceras en el origen)

`parseCSVPreview` (en `src/utils/csvLoader.js`) deja de confiar ciegamente en los
nombres de cabecera de PapaParse. Se sanean los nombres:

- Todo header **vacío o solo espacios** se renombra a `col_N` (N = posición 1-based).
- Headers **duplicados** se desambiguan con sufijo (`nombre`, `nombre_2`, …).
- Las **claves de las filas** se remapean a los nombres saneados, para que
  `rawCSVRows` siga siendo coherente con `csvHeaders`.

Implementación recomendada: unificar ambas ramas (`hasHeader` true/false) parseando
siempre con `header: false` (filas como arrays) y construyendo los objetos de fila
a partir de los headers saneados. La rama `hasHeader: false` ya hace exactamente
esto con nombres sintéticos `col_N`; se generaliza para que la rama `true` use la
primera fila como fuente de nombres y los sanee igual.

Resultado: `csvHeaders` nunca contiene nombres vacíos ni duplicados. Esto mata el
crash y elimina un bug latente (un header `""` colisiona con el valor centinela
`""` = "— sin asignar —" del desplegable de mapeo).

Nota para el usuario: este CSV tampoco tiene cabecera real. Con el fix ya no
crashea, pero para interpretarlo bien hay que **destildar "La primera fila
contiene encabezados"** (control ya existente). Tras destildar, las columnas pasan
a `col_1…col_5` y la primera fila (Pt30) vuelve a ser un punto.

### Parte 2 — Desactivar filas en el import

Permitir marcar filas concretas como desactivadas para que no entren al paso
siguiente. La tabla muestra **todas** las filas; ninguna se excluye por defecto.

**Interacción**
- Clic en cualquier parte de una fila de datos alterna su estado (activa ⇄
  desactivada).
- Fila desactivada: fondo rojo atenuado + texto tachado y opaco. Visible pero
  claramente "borrada".
- Columna líder con un icono de estado/acción: `✕` cuando la fila está activa
  (sugiere "quitar"), `↺` cuando está desactivada ("restaurar"). Da affordance de
  que la fila es clickeable y un punto explícito para reactivar.
- Contador junto a "Vista previa": `N filas · M desactivadas`.

**Estado**
- Nuevo en `AppContext`: `disabledRows` como `Set<number>` (índices dentro de
  `rawCSVRows`).
- Acciones: `TOGGLE_ROW` (payload: índice) y `RESET_DISABLED_ROWS`.
- Se limpia (`RESET_DISABLED_ROWS`) en `SET_PARSE_OPTIONS` y `SET_CSV_PREVIEW`,
  porque al reparsear cambian las filas y los índices dejan de ser válidos.

**Identidad de fila**
- El preview muestra `rawCSVRows.slice(0, N)` (sin orden alterado en el origen),
  así que el índice de la fila en el preview coincide con su índice en
  `rawCSVRows`. Ese índice es el identificador estable para `disabledRows`.

**Efecto aguas abajo** (en `src/utils/csvLoader.js`)
- `buildCanonicalCSV` recibe `disabledRows` y **salta** esas filas → no llegan a
  Python (ni detección ni geometría).
- `validateRows` recibe `disabledRows` y **salta** esas filas → una fila mala que
  el usuario desactivó deja de bloquear el botón "Detectar".

## Componentes y responsabilidades

| Archivo | Cambio |
|---|---|
| `src/utils/csvLoader.js` | Parte 1: saneo de headers en `parseCSVPreview`. Parte 2: `buildCanonicalCSV` y `validateRows` aceptan y saltan `disabledRows`. |
| `src/context/AppContext.jsx` | Estado `disabledRows` + acciones `TOGGLE_ROW` / `RESET_DISABLED_ROWS`; limpiar en `SET_PARSE_OPTIONS` y `SET_CSV_PREVIEW`. |
| `src/components/DataTable/DataTable.jsx` | Props opcionales `isRowDisabled(index)` y `onToggleRow(index)`; columna líder con icono; estilo de fila desactivada; clic de fila. Se mantiene genérico (props opcionales; sin ellas la tabla se comporta igual). |
| `src/components/CSVPreview/CSVPreview.jsx` | Cablear props del `DataTable`; pasar `disabledRows` a `buildCanonicalCSV`/`validateRows`; contador "N filas · M desactivadas". Las columnas de preview reciben un `id` estable (refuerzo del fix de Parte 1). |

## Decisiones de diseño

- **Solo filas, no columnas**: las columnas se excluyen del proceso al no
  mapearlas; un control extra sería redundante (YAGNI).
- **DataTable se mantiene genérico**: las nuevas capacidades son props opcionales.
  La vista canónica (post-detección) puede no pasarlas y se comporta igual.
- **Desactivación solo en la etapa de preview/mapeo** (`appMode` `preview` /
  `detecting`), antes de detectar. Las filas desactivadas simplemente no existen
  para los pasos siguientes.
- **Límite conocido**: solo se pueden desactivar filas visibles según el selector
  de filas (5/10/25/50/Todas). Para filas lejanas, usar "Todas". Aceptado.

## Testing

- `csvLoader.test`: `parseCSVPreview` con header vacío y con headers duplicados →
  `csvHeaders` saneado (`col_N`, sufijos) y filas remapeadas; reproducir el CSV
  del bug (sin cabecera, primera fila con coma final) sin error.
- `csvLoader.test`: `buildCanonicalCSV` y `validateRows` con `disabledRows` →
  filas desactivadas omitidas.
- `AppContext.test`: `TOGGLE_ROW` alterna pertenencia en `disabledRows`;
  `SET_PARSE_OPTIONS` y `SET_CSV_PREVIEW` lo limpian.
- `CSVPreview.test` / `DataTable.test`: clic en fila la marca desactivada (estilo
  + icono ↺); el contador refleja el número desactivado; un CSV con header vacío
  renderiza la tabla sin crash.

## Fuera de alcance

- Coordenadas geográficas en el visor 3D (rango ~0.0001° hace que `spread` caiga
  al piso de 10 y los puntos colapsen a un punto). Problema real pero separado;
  no se aborda aquí.
- Detección automática de "CSV sin cabecera".
