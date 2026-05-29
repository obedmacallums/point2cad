import { useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { usePythonBridge } from './usePythonBridge'
import { buildCanonicalCSV } from '../utils/csvLoader'

// Tras restaurar una sesión guardada, la geometría no está persistida: si la
// etapa restaurada es 'ready' o 'viewer', hay que regenerarla con Python una vez
// que Pyodide esté listo. Devuelve true mientras esa regeneración está pendiente.
export function useSessionRehydration() {
  const { state, dispatch } = useApp()
  const { processCSV, isLoading, isRunning } = usePythonBridge()
  const triggered = useRef(false)

  const needsGeometry =
    (state.appMode === 'ready' || state.appMode === 'viewer') &&
    state.points.length + state.lines.length + state.polylines.length === 0 &&
    Boolean(state.rawCSVText) &&
    state.codesSummary.length > 0

  useEffect(() => {
    if (!needsGeometry) {
      triggered.current = false
      return
    }
    if (isLoading || isRunning || triggered.current) return

    triggered.current = true
    const targetMode = state.appMode // 'ready' o 'viewer'
    const canonicalCSV = buildCanonicalCSV(
      state.csvHeaders,
      state.rawCSVRows,
      state.columnMapping,
    )

    processCSV(canonicalCSV, state.fileName, state.featureLibrary).then((geo) => {
      // processCSV deja appMode en 'ready'; si veníamos del viewer, regresamos.
      if (geo && targetMode === 'viewer') {
        dispatch({ type: 'SET_MODE', payload: 'viewer' })
      }
    })
  }, [
    needsGeometry,
    isLoading,
    isRunning,
    state.appMode,
    state.csvHeaders,
    state.rawCSVRows,
    state.columnMapping,
    state.fileName,
    state.featureLibrary,
    processCSV,
    dispatch,
  ])

  return needsGeometry
}
