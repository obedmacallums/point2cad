import { useCallback } from 'react'
import { usePyodide } from '../context/PyodideContext'
import { useApp } from '../context/AppContext'
import { assignColors } from '../utils/csvLoader'

import csvParserCode from '../../python/csv_parser.py?raw'
import geometryBuilderCode from '../../python/geometry_builder.py?raw'
import dxfGeneratorCode from '../../python/dxf_generator.py?raw'

export function usePythonBridge() {
  const { isLoading, isRunning, runPython } = usePyodide()
  const { dispatch } = useApp()

  const detectCodes = useCallback(
    async (csvText) => {
      dispatch({ type: 'SET_DETECTING' })

      const code = `
import json as _json

${csvParserCode}

csv_text = _json.loads(${JSON.stringify(JSON.stringify(csvText))})
points_raw = parse_csv(csv_text)
codes = detect_codes(points_raw)
print(_json.dumps({"type": "codes", "data": codes}))
`
      const { stdout, stderr } = await runPython(code)

      if (stderr) {
        dispatch({ type: 'SET_ERROR', payload: stderr })
        return
      }

      for (const line of stdout.split('\n').filter(Boolean)) {
        try {
          const result = JSON.parse(line)
          if (result.type === 'codes') {
            const codesSummary = result.data
            const featureLibrary = assignColors(codesSummary)
            dispatch({
              type: 'SET_CODES_DETECTED',
              payload: { codesSummary, featureLibrary },
            })
          }
        } catch {
          // línea no-JSON, ignorar
        }
      }
    },
    [runPython, dispatch]
  )

  const processCSV = useCallback(
    async (csvText, fileName, featureLibrary) => {
      dispatch({ type: 'SET_PROCESSING', payload: true })

      const code = `
import json as _json

# Biblioteca de características definida por el usuario desde JS
FEATURE_LIBRARY = _json.loads(${JSON.stringify(JSON.stringify(featureLibrary))})

${csvParserCode}
${geometryBuilderCode}

csv_text = _json.loads(${JSON.stringify(JSON.stringify(csvText))})
points_raw = parse_csv(csv_text)
geometry = build_geometry(points_raw, FEATURE_LIBRARY)

print(_json.dumps({"type": "geometry", "data": geometry}))
`
      const { stdout, stderr } = await runPython(code)

      if (stderr) {
        dispatch({ type: 'SET_ERROR', payload: stderr })
        return
      }

      for (const line of stdout.split('\n').filter(Boolean)) {
        try {
          const result = JSON.parse(line)
          if (result.type === 'geometry') {
            dispatch({ type: 'SET_GEOMETRY', payload: result.data })
          }
        } catch {
          // línea no-JSON, ignorar
        }
      }
    },
    [runPython, dispatch]
  )

  const exportDXF = useCallback(
    async (geometry, featureLibrary, fileName) => {
      const code = `
import json as _json

${dxfGeneratorCode}

geometry    = _json.loads(${JSON.stringify(JSON.stringify(geometry))})
feature_lib = _json.loads(${JSON.stringify(JSON.stringify(featureLibrary))})
dxf_content = generate_dxf(geometry, feature_lib)
print(_json.dumps({"type": "dxf_ready", "data": {"content": dxf_content, "filename": ${JSON.stringify(fileName.replace('.csv', '.dxf'))}}}))
`
      const { stdout, stderr } = await runPython(code)

      if (stderr) {
        console.error('Error generando DXF:', stderr)
        return
      }

      for (const line of stdout.split('\n').filter(Boolean)) {
        try {
          const result = JSON.parse(line)
          if (result.type === 'dxf_ready') {
            triggerDownload(result.data.content, result.data.filename)
          }
        } catch {}
      }
    },
    [runPython]
  )

  return { detectCodes, processCSV, exportDXF, isLoading, isRunning }
}

function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'application/dxf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
