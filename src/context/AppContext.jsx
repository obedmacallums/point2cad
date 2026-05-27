import { createContext, useContext, useReducer } from 'react'
import {
  autoDetectMapping,
  parseCSVPreview,
  DEFAULT_PARSE_OPTIONS,
  REQUIRED_FIELDS,
} from '../utils/csvLoader'

const AppContext = createContext(null)

const emptyMapping = () =>
  Object.fromEntries(REQUIRED_FIELDS.map((f) => [f, null]))

const initialState = {
  appMode: 'idle', // 'idle' | 'preview' | 'detecting' | 'codes_ready' | 'processing' | 'ready' | 'viewer'

  rawCSVText: null,
  rawCSVRows: [],
  csvHeaders: [],

  // Opciones de parsing aplicadas al rawCSVText
  parseOptions: { ...DEFAULT_PARSE_OPTIONS },

  // Mapeo del CSV original → campos canónicos requeridos por Python
  columnMapping: emptyMapping(),

  // Resumen devuelto por Python tras detectar
  codesSummary: [],

  // { CODIGO: { color, capa } } — colores asignados en JS al recibir codesSummary
  featureLibrary: {},

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

function reducer(state, action) {
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
        codesSummary: [],
        featureLibrary: {},
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
      try {
        const { headers, rows } = parseCSVPreview(state.rawCSVText, merged)
        return {
          ...state,
          appMode: 'preview',
          parseOptions: merged,
          csvHeaders: headers,
          rawCSVRows: rows,
          columnMapping: autoDetectMapping(headers),
          codesSummary: [],
          featureLibrary: {},
          points: [],
          lines: [],
          polylines: [],
          error: null,
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
      }

    case 'SET_DETECTING':
      return { ...state, appMode: 'detecting', error: null }

    case 'SET_CODES_DETECTED':
      return {
        ...state,
        appMode: 'codes_ready',
        codesSummary: action.payload.codesSummary,
        featureLibrary: action.payload.featureLibrary,
        error: null,
      }

    case 'UPDATE_FEATURE':
      return {
        ...state,
        featureLibrary: {
          ...state.featureLibrary,
          [action.payload.codigo]: {
            ...state.featureLibrary[action.payload.codigo],
            ...action.payload.changes,
          },
        },
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

    case 'RESET':
      return initialState

    default:
      return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
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
