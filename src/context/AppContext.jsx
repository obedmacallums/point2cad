import { createContext, useContext, useEffect, useReducer, useRef } from 'react'
import {
  autoDetectMapping,
  assignColors,
  parseCSVPreview,
  DEFAULT_PARSE_OPTIONS,
  REQUIRED_FIELDS,
} from '../utils/csvLoader'
import { saveSession } from '../utils/sessionStorage'

const AppContext = createContext(null)

const emptyMapping = () =>
  Object.fromEntries(REQUIRED_FIELDS.map((f) => [f, null]))

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
    const visiblePatch =
      existing[codigo]?.visible !== undefined
        ? { visible: existing[codigo].visible }
        : {}
    const fxlFeature = fxl?.features?.[codigo]
    if (fxlFeature) {
      lib[codigo] = {
        color: fxlFeature.color ?? defaults[codigo].color,
        capa: fxlFeature.capa ?? codigo,
        ...visiblePatch,
      }
      continue
    }
    // Sin edición manual ni FXL: paleta/código por defecto (no se arrastran
    // valores de un FXL retirado), conservando solo la visibilidad.
    lib[codigo] = { ...defaults[codigo], ...visiblePatch }
  }
  return lib
}


export const initialState = {
  appMode: 'idle', // 'idle' | 'preview' | 'detecting' | 'codes_ready' | 'processing' | 'ready' | 'viewer'

  rawCSVText: null,
  rawCSVRows: [],
  csvHeaders: [],

  // Índices de filas desactivadas en el preview: no entran a detección, validación
  // ni al CSV canónico que va a Python. Array (no Set) para serializar en sesión.
  disabledRows: [],

  // Opciones de parsing aplicadas al rawCSVText
  parseOptions: { ...DEFAULT_PARSE_OPTIONS },

  // Mapeo del CSV original → campos canónicos requeridos por Python
  columnMapping: emptyMapping(),

  // Resumen devuelto por Python tras detectar
  codesSummary: [],

  // { CODIGO: { color, capa } } — colores asignados en JS al recibir codesSummary
  featureLibrary: {},
  // Biblioteca FXL importada (opcional): { fileName, features, controlRoles } | null.
  fxl: null,
  // Códigos cuyo color/capa editó el usuario a mano (el FXL no los pisa).
  userEditedCodes: [],

  // Control codes detectados (modelo para la UI): [{token, role, source, ratio, count}]
  controlCodes: [],
  // token → rol SOLO para los control codes reasignados manualmente por el
  // usuario (override). Los no editados conservan su rol/fuente detectados.
  controlOverrides: {},

  points: [],
  lines: [],
  polylines: [],

  // Toggle del viewer 3D: si true, los vértices de líneas/polilíneas se
  // muestran como dots adicionales. Se resetea a false al entrar al viewer.
  showLineVertices: false,

  isProcessing: false,
  error: null,
  fileName: null,
}

export function reducer(state, action) {
  switch (action.type) {
    case 'SET_CSV_PREVIEW': {
      const { rawCSVText, rows, headers, fileName, parseOptions } = action.payload
      return {
        ...state,
        appMode: 'preview',
        rawCSVText,
        rawCSVRows: rows,
        csvHeaders: headers,
        fileName,
        parseOptions: { ...DEFAULT_PARSE_OPTIONS, ...(parseOptions ?? {}) },
        columnMapping: autoDetectMapping(headers),
        disabledRows: [],
        codesSummary: [],
        featureLibrary: {},
        userEditedCodes: [],
        controlCodes: [],
        controlOverrides: {},
        points: [],
        lines: [],
        polylines: [],
        error: null,
      }
    }

    case 'SET_PARSE_OPTIONS': {
      const merged = { ...state.parseOptions, ...action.payload }
      if (!state.rawCSVText) {
        return { ...state, parseOptions: merged }
      }
      // En modo plano, el CRS declarado (projectedCrs/zona/hemisferio) solo
      // afecta a los metadatos de exportación, no al parseo ni a la geometría:
      // se puede cambiar después de procesar sin invalidar nada.
      const EXPORT_ONLY_PROJECTED = ['projectedCrs', 'utmZone', 'hemisphere']
      if (
        state.parseOptions.coordSystem === 'projected' &&
        merged.coordSystem === 'projected' &&
        Object.keys(action.payload).every((k) =>
          EXPORT_ONLY_PROJECTED.includes(k),
        )
      ) {
        return { ...state, parseOptions: merged }
      }
      // Cambiar cualquier opción invalida lo que viene después (los códigos y la
      // geometría dependen de cómo se interpretan las coordenadas).
      const downstreamReset = {
        appMode: 'preview',
        codesSummary: [],
        featureLibrary: {},
        controlCodes: [],
        controlOverrides: {},
        points: [],
        lines: [],
        polylines: [],
        error: null,
      }
      // Solo el delimitador y el flag de encabezados cambian CÓMO se cortan las
      // filas/columnas. El resto (sistema de coordenadas, formato de ángulo, zona
      // UTM, separador decimal) no altera la rejilla, así que conservamos el mapeo
      // y las filas desactivadas en vez de re-autodetectar y perderlos.
      const STRUCTURAL_KEYS = ['delimiter', 'hasHeader']
      const structuralChange = STRUCTURAL_KEYS.some(
        (k) => k in action.payload && action.payload[k] !== state.parseOptions[k],
      )
      if (!structuralChange) {
        return { ...state, ...downstreamReset, parseOptions: merged }
      }
      try {
        const { headers, rows } = parseCSVPreview(state.rawCSVText, merged)
        return {
          ...state,
          ...downstreamReset,
          parseOptions: merged,
          csvHeaders: headers,
          rawCSVRows: rows,
          columnMapping: autoDetectMapping(headers),
          disabledRows: [],
        }
      } catch (err) {
        return { ...state, parseOptions: merged, error: err.message }
      }
    }

    case 'SET_COLUMN_MAPPING':
      return {
        ...state,
        columnMapping: {
          ...state.columnMapping,
          [action.payload.field]: action.payload.column,
        },
        // Cambiar el mapeo invalida todo lo que viene después (igual que
        // SET_PARSE_OPTIONS). La ausencia de codesSummary/geometría sirve como
        // señal de que hay que volver a detectar/procesar al avanzar.
        codesSummary: [],
        featureLibrary: {},
        controlCodes: [],
        controlOverrides: {},
        points: [],
        lines: [],
        polylines: [],
      }

    case 'TOGGLE_ROW': {
      const idx = action.payload
      const has = state.disabledRows.includes(idx)
      return {
        ...state,
        disabledRows: has
          ? state.disabledRows.filter((i) => i !== idx)
          : [...state.disabledRows, idx],
      }
    }

    case 'SET_DETECTING':
      return { ...state, appMode: 'detecting', error: null }

    case 'SET_CODES_DETECTED': {
      const { codesSummary, controlCodes = [] } = action.payload
      return {
        ...state,
        appMode: 'codes_ready',
        codesSummary,
        // Preserva color/capa ya editados; asigna defaults a códigos nuevos.
        featureLibrary: buildFeatureLibrary(
          codesSummary, state.featureLibrary, state.fxl, state.userEditedCodes,
        ),
        controlCodes,
        // controlOverrides se preserva: solo el usuario lo modifica (no se
        // re-siembra con la detección, para no marcar como "manual" lo que no
        // tocó). Las invalidaciones de mapeo/parseo sí lo limpian.
        error: null,
      }
    }

    case 'SET_CONTROL_ROLE':
      return {
        ...state,
        controlOverrides: {
          ...state.controlOverrides,
          [action.payload.token]: action.payload.role,
        },
      }

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

    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.payload, appMode: 'processing', error: null }

    case 'SET_GEOMETRY':
      return {
        ...state,
        points: action.payload.points,
        lines: action.payload.lines,
        polylines: action.payload.polylines,
        isProcessing: false,
        appMode: 'ready',
      }

    case 'SET_MODE': {
      if (action.payload === 'viewer') {
        const resetLibrary = Object.fromEntries(
          Object.entries(state.featureLibrary).map(([codigo, feature]) => [
            codigo,
            { ...feature, visible: true },
          ]),
        )
        return {
          ...state,
          appMode: 'viewer',
          featureLibrary: resetLibrary,
          showLineVertices: false,
        }
      }
      return { ...state, appMode: action.payload }
    }

    case 'SET_SHOW_LINE_VERTICES':
      return { ...state, showLineVertices: action.payload }

    case 'SET_ERROR': {
      // Volver al último estado seguro según la fase donde ocurrió el error
      const fallback =
        state.appMode === 'detecting' || state.appMode === 'preview'
          ? 'preview'
          : state.codesSummary.length > 0
            ? 'codes_ready'
            : 'preview'
      return { ...state, error: action.payload, isProcessing: false, appMode: fallback }
    }

    case 'RESTORE_SESSION': {
      const saved = action.payload
      // Sin CSV guardado no podemos reconstruir el flujo: empezamos limpio.
      if (!saved || !saved.rawCSVText) return initialState

      const parseOptions = {
        ...DEFAULT_PARSE_OPTIONS,
        ...(saved.parseOptions ?? {}),
      }

      let csvHeaders = []
      let rawCSVRows = []
      try {
        const parsed = parseCSVPreview(saved.rawCSVText, parseOptions)
        csvHeaders = parsed.headers
        rawCSVRows = parsed.rows
      } catch {
        return initialState
      }

      return {
        ...initialState,
        appMode: saved.appMode ?? 'preview',
        rawCSVText: saved.rawCSVText,
        rawCSVRows,
        csvHeaders,
        parseOptions,
        // Preservamos el mapeo guardado en lugar de re-autodetectarlo.
        columnMapping: saved.columnMapping ?? emptyMapping(),
        // Los índices siguen siendo válidos: aquí se reparsea con las mismas opciones.
        disabledRows: saved.disabledRows ?? [],
        codesSummary: saved.codesSummary ?? [],
        featureLibrary: saved.featureLibrary ?? {},
        controlCodes: saved.controlCodes ?? [],
        controlOverrides: saved.controlOverrides ?? {},
        fxl: saved.fxl ?? null,
        userEditedCodes: saved.userEditedCodes ?? [],
        fileName: saved.fileName ?? null,
        showLineVertices: saved.showLineVertices ?? false,
        // La geometría se regenera con useSessionRehydration.
        points: [],
        lines: [],
        polylines: [],
      }
    }

    case 'RESET':
      return initialState

    default:
      return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Persistencia automática: guarda el subconjunto serializable del state cada
  // vez que cambia un campo relevante. saveSession limpia localStorage en idle.
  // Se salta la primera ejecución (montaje) para no borrar la sesión guardada
  // antes de que el usuario decida si la restaura.
  const isFirstRun = useRef(true)
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    saveSession(state)
  }, [
    state.appMode,
    state.rawCSVText,
    state.parseOptions,
    state.columnMapping,
    state.disabledRows,
    state.codesSummary,
    state.featureLibrary,
    state.controlCodes,
    state.controlOverrides,
    state.fileName,
    state.showLineVertices,
  ])

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp debe usarse dentro de AppProvider')
  return ctx
}
