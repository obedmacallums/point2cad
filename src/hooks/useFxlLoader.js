// src/hooks/useFxlLoader.js
import { useCallback, useState } from 'react'
import { useApp } from '../context/AppContext'
import { usePythonBridge } from './usePythonBridge'

// Extrae la última línea no vacía de un mensaje de error (parseFxl lanza el
// traceback de Python completo; nos quedamos con la línea final, que es el
// "ValueError: ..." legible).
function lastLine(message) {
  const lines = String(message).split('\n').map((l) => l.trim()).filter(Boolean)
  return lines[lines.length - 1] ?? String(message)
}

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
        const msg = `No se pudo leer el FXL: ${lastLine(err.message)}`
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
