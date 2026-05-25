import { useCallback } from 'react'
import { useApp } from '../context/AppContext'
import {
  readFileAsText,
  parseCSVPreview,
  DEFAULT_PARSE_OPTIONS,
} from '../utils/csvLoader'

export function useCSVLoader() {
  const { dispatch } = useApp()

  const loadFile = useCallback(
    async (file) => {
      if (!file) return
      try {
        const rawCSVText = await readFileAsText(file)
        const parseOptions = { ...DEFAULT_PARSE_OPTIONS }
        const { headers, rows } = parseCSVPreview(rawCSVText, parseOptions)
        dispatch({
          type: 'SET_CSV_PREVIEW',
          payload: { rawCSVText, headers, rows, fileName: file.name, parseOptions },
        })
      } catch (err) {
        dispatch({ type: 'SET_ERROR', payload: err.message })
      }
    },
    [dispatch]
  )

  return { loadFile }
}
