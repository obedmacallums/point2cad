import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useApp } from '../../context/AppContext'
import { usePythonBridge } from '../../hooks/usePythonBridge'
import { REQUIRED_FIELDS, buildCanonicalCSV, validateRows } from '../../utils/csvLoader'
import DataTable from '../DataTable/DataTable'

const colHelper = createColumnHelper()

const TIPO_COLOR = {
  'Punto':              'text-green-400',
  'Línea abierta':      'text-yellow-400',
  'Polilínea cerrada':  'text-purple-400',
}

const ROW_COUNT_OPTIONS = [
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: 25, label: '25' },
  { value: 50, label: '50' },
  { value: -1, label: 'Todas' },
]

const FIELD_LABELS = {
  nombre: 'Nombre',
  x: 'X (Este)',
  y: 'Y (Norte)',
  z: 'Z (Elevación)',
  codigo: 'Código',
}

const DELIMITER_OPTIONS = [
  { value: 'auto', label: 'Auto-detectar' },
  { value: ',', label: ', (coma)' },
  { value: ';', label: '; (punto y coma)' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: '| (pipe)' },
]

const DECIMAL_OPTIONS = [
  { value: '.', label: '. (punto)' },
  { value: ',', label: ', (coma)' },
]

// Color por campo requerido: resalta en la tabla las columnas ya mapeadas.
const FIELD_ACCENT = {
  nombre: {
    th: 'bg-cyan-900/40 text-cyan-100',
    td: 'bg-cyan-950/30',
    badge: 'bg-cyan-700 text-white',
  },
  x: {
    th: 'bg-rose-900/40 text-rose-100',
    td: 'bg-rose-950/30',
    badge: 'bg-rose-700 text-white',
  },
  y: {
    th: 'bg-emerald-900/40 text-emerald-100',
    td: 'bg-emerald-950/30',
    badge: 'bg-emerald-700 text-white',
  },
  z: {
    th: 'bg-amber-900/40 text-amber-100',
    td: 'bg-amber-950/30',
    badge: 'bg-amber-700 text-white',
  },
  codigo: {
    th: 'bg-violet-900/40 text-violet-100',
    td: 'bg-violet-950/30',
    badge: 'bg-violet-700 text-white',
  },
}

const FIELD_BADGE_LABEL = {
  nombre: 'NOMBRE',
  x: 'X',
  y: 'Y',
  z: 'Z',
  codigo: 'CÓDIGO',
}

// Paleta rápida: colores ACI clásicos de AutoCAD + negro.
const QUICK_COLORS = [
  { hex: '#ff0000', name: 'Rojo' },
  { hex: '#ffff00', name: 'Amarillo' },
  { hex: '#00ff00', name: 'Verde' },
  { hex: '#00ffff', name: 'Cian' },
  { hex: '#0000ff', name: 'Azul' },
  { hex: '#ff00ff', name: 'Magenta' },
  { hex: '#ffffff', name: 'Blanco' },
  { hex: '#000000', name: 'Negro' },
]

export default function CSVPreview() {
  const { state, dispatch } = useApp()
  const { detectCodes, processCSV, isLoading, isRunning } = usePythonBridge()

  const [previewRowsCount, setPreviewRowsCount] = useState(5)

  const isDetecting = state.appMode === 'detecting'
  const isProcessing = state.appMode === 'processing' || state.isProcessing
  const busy = isRunning || isDetecting || isProcessing

  // Mapa inverso: header del CSV → campo requerido al que está mapeado (o undefined).
  const headerToField = useMemo(() => {
    const map = {}
    for (const f of REQUIRED_FIELDS) {
      const col = state.columnMapping[f]
      if (col) map[col] = f
    }
    return map
  }, [state.columnMapping])

  const previewColumns = useMemo(
    () =>
      (state.csvHeaders ?? []).map((h) => {
        const mappedField = headerToField[h]
        const accent = mappedField ? FIELD_ACCENT[mappedField] : null
        return colHelper.accessor(h, {
          header: () => (
            <span className="inline-flex items-center gap-1.5">
              <span>{h.toUpperCase()}</span>
              {mappedField && (
                <span
                  className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${accent.badge}`}
                >
                  {FIELD_BADGE_LABEL[mappedField]}
                </span>
              )}
            </span>
          ),
          cell: (info) => String(info.getValue() ?? ''),
          meta: {
            headerClassName: accent?.th ?? '',
            cellClassName: accent?.td ?? '',
          },
        })
      }),
    [state.csvHeaders, headerToField]
  )

  const previewRows = useMemo(
    () =>
      previewRowsCount === -1
        ? state.rawCSVRows
        : state.rawCSVRows.slice(0, previewRowsCount),
    [state.rawCSVRows, previewRowsCount]
  )

  // Validación del mapping
  const mappingValues = REQUIRED_FIELDS.map((f) => state.columnMapping[f])
  const mappingComplete = mappingValues.every(Boolean)
  const usageCount = mappingValues.reduce((acc, v) => {
    if (v) acc[v] = (acc[v] ?? 0) + 1
    return acc
  }, {})
  const mappingHasConflicts = Object.values(usageCount).some((n) => n > 1)

  const delimitersClash =
    state.parseOptions.delimiter !== 'auto' &&
    state.parseOptions.delimiter === state.parseOptions.decimalSeparator

  // Validación de filas — solo si el mapping está completo y sin conflictos.
  const validation = useMemo(() => {
    if (!mappingComplete || mappingHasConflicts) return null
    return validateRows(state.rawCSVRows, state.columnMapping, state.parseOptions)
  }, [
    state.rawCSVRows,
    state.columnMapping,
    state.parseOptions,
    mappingComplete,
    mappingHasConflicts,
  ])

  const invalidCount = validation?.summary.invalidCount ?? 0
  const hasInvalidRows = invalidCount > 0

  const canDetect =
    mappingComplete &&
    !mappingHasConflicts &&
    !delimitersClash &&
    !hasInvalidRows &&
    !isLoading &&
    !busy

  const detectBlockReason = !mappingComplete
    ? 'Asigna todas las columnas requeridas'
    : mappingHasConflicts
      ? 'Hay columnas asignadas a más de un campo'
      : delimitersClash
        ? 'El separador de columna y el decimal no pueden ser iguales'
        : hasInvalidRows
          ? `Hay ${invalidCount} fila${invalidCount === 1 ? '' : 's'} con valores inválidos`
          : ''

  function updateFeature(codigo, changes) {
    dispatch({ type: 'UPDATE_FEATURE', payload: { codigo, changes } })
  }

  function updateMapping(field, column) {
    dispatch({
      type: 'SET_COLUMN_MAPPING',
      payload: { field, column: column || null },
    })
  }

  function updateParseOption(key, value) {
    dispatch({ type: 'SET_PARSE_OPTIONS', payload: { [key]: value } })
  }

  async function handleDetect() {
    const canonicalCSV = buildCanonicalCSV(
      state.csvHeaders,
      state.rawCSVRows,
      state.columnMapping
    )
    await detectCodes(canonicalCSV)
  }

  async function handleProcess() {
    const canonicalCSV = buildCanonicalCSV(
      state.csvHeaders,
      state.rawCSVRows,
      state.columnMapping
    )
    await processCSV(canonicalCSV, state.fileName, state.featureLibrary)
  }

  // Botón principal según el estado actual
  let mainButton
  if (state.appMode === 'preview' || state.appMode === 'detecting') {
    const label = isLoading
      ? 'Cargando Python…'
      : isDetecting
        ? 'Detectando…'
        : 'Detectar códigos'
    mainButton = (
      <button
        onClick={handleDetect}
        disabled={!canDetect}
        className="px-4 py-1.5 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title={detectBlockReason}
      >
        {label}
      </button>
    )
  } else if (state.appMode === 'codes_ready' || state.appMode === 'processing') {
    mainButton = (
      <button
        onClick={handleProcess}
        disabled={isLoading || busy}
        className="px-4 py-1.5 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isProcessing ? 'Procesando…' : 'Procesar'}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6 h-full overflow-y-auto bg-gray-950">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">{state.fileName}</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {state.rawCSVRows.length.toLocaleString()} filas · {state.csvHeaders.length} columnas
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => dispatch({ type: 'RESET' })}
            className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 transition-colors"
          >
            Cancelar
          </button>
          {mainButton}
        </div>
      </div>

      {isLoading && (
        <p className="text-xs text-yellow-400 bg-yellow-950/30 border border-yellow-800/50 rounded px-3 py-2 flex items-center gap-2">
          <span className="animate-spin inline-block">⟳</span>
          Cargando el intérprete de Python… El botón se habilitará en unos segundos.
        </p>
      )}

      {state.error && (
        <p className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded px-3 py-2">
          {state.error}
        </p>
      )}

      {/* Vista previa */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Vista previa
          </h3>
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-gray-500 mr-1">Filas:</span>
            {ROW_COUNT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPreviewRowsCount(opt.value)}
                className={`px-2 py-0.5 rounded transition-colors ${
                  previewRowsCount === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <DataTable
          columns={previewColumns}
          data={previewRows}
          maxHeight={previewRowsCount === -1 || previewRowsCount > 10 ? '420px' : '220px'}
        />
      </section>

      {/* Opciones del CSV — solo antes de detectar */}
      {(state.appMode === 'preview' || state.appMode === 'detecting') && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Opciones del CSV
            </h3>
            <p className="text-[11px] text-gray-500">
              Ajusta el parseo si el archivo no usa los valores por defecto
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase text-gray-500 font-semibold">
                Separador de columna
              </span>
              <select
                value={state.parseOptions.delimiter}
                onChange={(e) => updateParseOption('delimiter', e.target.value)}
                className={`bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 border ${
                  delimitersClash ? 'border-red-500' : 'border-gray-700'
                }`}
              >
                {DELIMITER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase text-gray-500 font-semibold">
                Separador decimal
              </span>
              <select
                value={state.parseOptions.decimalSeparator}
                onChange={(e) => updateParseOption('decimalSeparator', e.target.value)}
                className={`bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 border ${
                  delimitersClash ? 'border-red-500' : 'border-gray-700'
                }`}
              >
                {DECIMAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase text-gray-500 font-semibold">
                Encabezados
              </span>
              <label className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded px-2 py-1.5 border border-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.parseOptions.hasHeader}
                  onChange={(e) => updateParseOption('hasHeader', e.target.checked)}
                  className="accent-blue-500"
                />
                <span>La primera fila contiene encabezados</span>
              </label>
            </label>
          </div>

          {delimitersClash && (
            <p className="text-[11px] text-red-400">
              El separador de columna y el decimal no pueden ser iguales.
            </p>
          )}
        </section>
      )}

      {/* Mapeo de columnas — solo antes de detectar */}
      {(state.appMode === 'preview' || state.appMode === 'detecting') && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Mapeo de columnas
            </h3>
            <p className="text-[11px] text-gray-500">
              Indica qué columna del CSV corresponde a cada campo requerido
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {REQUIRED_FIELDS.map((field) => {
              const value = state.columnMapping[field] ?? ''
              const isConflict = value && usageCount[value] > 1
              const isMissing = !value
              const border = isConflict
                ? 'border-red-500'
                : isMissing
                  ? 'border-yellow-700'
                  : 'border-gray-700'
              return (
                <label key={field} className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase text-gray-500 font-semibold">
                    {FIELD_LABELS[field]}
                  </span>
                  <select
                    value={value}
                    onChange={(e) => updateMapping(field, e.target.value)}
                    className={`bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 border ${border}`}
                  >
                    <option value="">— sin asignar —</option>
                    {state.csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  {isConflict && (
                    <span className="text-[10px] text-red-400">
                      Columna usada en otro campo
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        </section>
      )}

      {/* Validación de filas — visible solo si hay errores y antes de detectar */}
      {(state.appMode === 'preview' || state.appMode === 'detecting') && hasInvalidRows && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-red-400">
              Filas con problemas
              <span className="ml-2 bg-red-950/60 text-red-300 text-[10px] px-1.5 py-0.5 rounded-full font-normal">
                {invalidCount} de {validation.summary.totalRows}
              </span>
            </h3>
            <p className="text-[11px] text-gray-500">
              Corrige el CSV o el mapeo antes de detectar códigos
            </p>
          </div>

          <div className="overflow-x-auto rounded border border-red-900/60 bg-red-950/20">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-red-950/40 text-red-300 uppercase tracking-wider">
                  <th className="px-2 py-1 text-left font-semibold">Fila</th>
                  <th className="px-2 py-1 text-left font-semibold">Campo</th>
                  <th className="px-2 py-1 text-left font-semibold">Valor</th>
                  <th className="px-2 py-1 text-left font-semibold">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {validation.invalidRows.slice(0, 10).flatMap(({ rowIndex, errors }) =>
                  errors.map((err, idx) => (
                    <tr
                      key={`${rowIndex}-${err.field}-${idx}`}
                      className="border-t border-red-900/40 text-gray-300"
                    >
                      <td className="px-2 py-1 font-mono">
                        {rowIndex + (state.parseOptions.hasHeader ? 2 : 1)}
                      </td>
                      <td className="px-2 py-1 font-mono text-blue-300">{err.field}</td>
                      <td className="px-2 py-1 font-mono text-gray-400 truncate max-w-[200px]">
                        {err.value === '' ? '∅' : err.value}
                      </td>
                      <td className="px-2 py-1 text-red-300">{err.reason}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {invalidCount > 10 && (
            <p className="text-[11px] text-gray-500">
              … y {invalidCount - 10} fila{invalidCount - 10 === 1 ? '' : 's'} más con problemas.
            </p>
          )}
        </section>
      )}

      {/* Códigos detectados — solo después de detectar */}
      {state.codesSummary.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Códigos detectados
              <span className="ml-2 bg-gray-800 text-gray-300 text-[10px] px-1.5 py-0.5 rounded-full font-normal">
                {state.codesSummary.length}
              </span>
            </h3>
            <p className="text-[11px] text-gray-500">
              Edita el color y la capa antes de procesar
            </p>
          </div>

          <div className="grid grid-cols-[180px_1fr_140px_120px] gap-3 text-[11px] font-semibold text-gray-500 uppercase px-2">
            <span>Color</span>
            <span>Código</span>
            <span>Capa DXF</span>
            <span>Tipo</span>
          </div>

          <div className="flex flex-col gap-1">
            {state.codesSummary.map(({ codigo, tipo }) => {
              const feature = state.featureLibrary[codigo] ?? { color: '#ffffff', capa: codigo }
              return (
                <div
                  key={codigo}
                  className="grid grid-cols-[180px_1fr_140px_120px] items-center gap-3 bg-gray-800/60 hover:bg-gray-800 rounded-lg px-2 py-2 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="relative w-6 h-6 flex-shrink-0">
                      <input
                        type="color"
                        value={feature.color}
                        onChange={(e) => updateFeature(codigo, { color: e.target.value })}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                        title="Color personalizado"
                      />
                      <div
                        className="w-6 h-6 rounded-full border-2 border-gray-600 pointer-events-none"
                        style={{ backgroundColor: feature.color }}
                      />
                    </div>
                    <div className="flex items-center gap-0.5">
                      {QUICK_COLORS.map(({ hex, name }) => {
                        const selected = feature.color.toLowerCase() === hex.toLowerCase()
                        return (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => updateFeature(codigo, { color: hex })}
                            title={name}
                            className={`w-4 h-4 rounded-sm transition-transform hover:scale-125 ${
                              selected
                                ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-800'
                                : 'border border-gray-700'
                            }`}
                            style={{ backgroundColor: hex }}
                          />
                        )
                      })}
                    </div>
                  </div>

                  <span className="font-mono text-xs font-semibold text-blue-300 truncate">
                    {codigo}
                  </span>

                  <input
                    type="text"
                    value={feature.capa}
                    onChange={(e) => updateFeature(codigo, { capa: e.target.value.toUpperCase() })}
                    className="bg-gray-700 hover:bg-gray-600 rounded px-2 py-0.5 text-xs text-gray-200 font-mono outline-none focus:ring-1 focus:ring-blue-500 w-full"
                    placeholder={codigo}
                  />

                  <span className={`text-[11px] ${TIPO_COLOR[tipo] ?? 'text-gray-400'}`}>
                    {tipo}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
