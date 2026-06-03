import { useCallback } from 'react'
import { usePyodide } from '../context/PyodideContext'
import { useApp } from '../context/AppContext'

import csvParserCode from '../../python/csv_parser.py?raw'
import fieldCodesCode from '../../python/field_codes.py?raw'
import shapesCode from '../../python/shapes.py?raw'
import geometryBuilderCode from '../../python/geometry_builder.py?raw'
import dxfGeneratorCode from '../../python/dxf_generator.py?raw'
import geojsonGeneratorCode from '../../python/geojson_generator.py?raw'
import shapefileGeneratorCode from '../../python/shapefile_generator.py?raw'
import geopackageGeneratorCode from '../../python/geopackage_generator.py?raw'

// Configuración de cada formato de exportación: el código Python del generador,
// la función a invocar, la extensión de salida, el MIME y si la salida es binaria
// (transportada como base64 por stdout).
const EXPORT_FORMATS = {
  dxf: {
    generatorCode: dxfGeneratorCode,
    call: 'generate_dxf(geometry, feature_lib, options)',
    extension: '.dxf',
    mimeType: 'application/dxf',
    binary: false,
  },
  geojson: {
    generatorCode: geojsonGeneratorCode,
    call: 'generate_geojson(geometry, feature_lib, options)',
    extension: '.geojson',
    mimeType: 'application/geo+json',
    binary: false,
  },
  shapefile: {
    generatorCode: shapefileGeneratorCode,
    call: 'generate_shapefile_zip_b64(geometry, feature_lib, options)',
    extension: '.zip',
    mimeType: 'application/zip',
    binary: true,
  },
  geopackage: {
    generatorCode: geopackageGeneratorCode,
    call: 'generate_geopackage_b64(geometry, feature_lib, options)',
    extension: '.gpkg',
    mimeType: 'application/geopackage+sqlite3',
    binary: true,
    requiresPackages: ['geopandas', 'fiona'],
  },
}

export function usePythonBridge() {
  const { isLoading, isRunning, runPython, ensurePackages } = usePyodide()
  const { dispatch } = useApp()

  const detectCodes = useCallback(
    async (csvText, controlOverrides = {}, { showDetecting = true } = {}) => {
      // Al reasignar un control code re-detectamos sin volver a la etapa
      // "detecting" (eso ocultaría la sección de revisión); refrescamos en sitio.
      if (showDetecting) dispatch({ type: 'SET_DETECTING' })

      const code = `
import json as _json

${csvParserCode}
${fieldCodesCode}

csv_text = _json.loads(${JSON.stringify(JSON.stringify(csvText))})
overrides = _json.loads(${JSON.stringify(JSON.stringify(controlOverrides))})
points_raw = parse_csv(csv_text)
codes = detect_codes(points_raw, overrides)
control_codes = detect_control_codes(points_raw, overrides)
print(_json.dumps({"type": "codes", "data": {"summary": codes, "controlCodes": control_codes}}))
`
      const { stdout, stderr } = await runPython(code)

      if (stderr) {
        dispatch({ type: 'SET_ERROR', payload: stderr })
        return null
      }

      for (const line of stdout.split('\n').filter(Boolean)) {
        try {
          const result = JSON.parse(line)
          if (result.type === 'codes') {
            const codesSummary = result.data.summary
            const controlCodes = result.data.controlCodes
            // El reducer construye/mergea la featureLibrary (preservando
            // colores/capas ya editados) y siembra los roles de control.
            dispatch({
              type: 'SET_CODES_DETECTED',
              payload: { codesSummary, controlCodes },
            })
            // Devolvemos el resultado para poder encadenar (p.ej. saltar
            // directo a "Procesar" desde el stepper).
            return { codesSummary, controlCodes }
          }
        } catch {
          // línea no-JSON, ignorar
        }
      }
      return null
    },
    [runPython, dispatch]
  )

  const processCSV = useCallback(
    async (csvText, fileName, featureLibrary, controlOverrides = {}) => {
      dispatch({ type: 'SET_PROCESSING', payload: true })

      const code = `
import json as _json

# Biblioteca de características definida por el usuario desde JS
FEATURE_LIBRARY = _json.loads(${JSON.stringify(JSON.stringify(featureLibrary))})
CONTROL_OVERRIDES = _json.loads(${JSON.stringify(JSON.stringify(controlOverrides))})

${csvParserCode}
${fieldCodesCode}
${shapesCode}
${geometryBuilderCode}

csv_text = _json.loads(${JSON.stringify(JSON.stringify(csvText))})
points_raw = parse_csv(csv_text)
geometry = build_geometry(points_raw, FEATURE_LIBRARY, CONTROL_OVERRIDES)

print(_json.dumps({"type": "geometry", "data": geometry}))
`
      const { stdout, stderr } = await runPython(code)

      if (stderr) {
        dispatch({ type: 'SET_ERROR', payload: stderr })
        return null
      }

      for (const line of stdout.split('\n').filter(Boolean)) {
        try {
          const result = JSON.parse(line)
          if (result.type === 'geometry') {
            dispatch({ type: 'SET_GEOMETRY', payload: result.data })
            return result.data
          }
        } catch {
          // línea no-JSON, ignorar
        }
      }
      return null
    },
    [runPython, dispatch]
  )

  const exportGeometry = useCallback(
    async (format, geometry, featureLibrary, fileName, options = {}) => {
      const fmt = EXPORT_FORMATS[format] ?? EXPORT_FORMATS.dxf
      const outName = (fileName ?? 'output.csv').replace(/\.csv$/i, fmt.extension)

      if (fmt.requiresPackages) {
        await ensurePackages(fmt.requiresPackages)
      }

      const code = `
import json as _json

${fmt.generatorCode}

geometry    = _json.loads(${JSON.stringify(JSON.stringify(geometry))})
feature_lib = _json.loads(${JSON.stringify(JSON.stringify(featureLibrary))})
options     = _json.loads(${JSON.stringify(JSON.stringify(options))})
content = ${fmt.call}
print(_json.dumps({"type": "export_ready", "data": {"content": content, "filename": ${JSON.stringify(outName)}}}))
`
      const { stdout, stderr } = await runPython(code)

      if (stderr) {
        console.error(`Error generando ${format}:`, stderr)
        return
      }

      for (const line of stdout.split('\n').filter(Boolean)) {
        try {
          const result = JSON.parse(line)
          if (result.type === 'export_ready') {
            triggerDownload(result.data.content, result.data.filename, {
              binary: fmt.binary,
              mimeType: fmt.mimeType,
            })
          }
        } catch {}
      }
    },
    [runPython, ensurePackages]
  )

  return { detectCodes, processCSV, exportGeometry, isLoading, isRunning }
}

function triggerDownload(content, filename, { binary = false, mimeType } = {}) {
  let blob
  if (binary) {
    // El contenido binario llega como base64; decodificar a bytes.
    const bytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0))
    blob = new Blob([bytes], { type: mimeType ?? 'application/octet-stream' })
  } else {
    blob = new Blob([content], { type: mimeType ?? 'text/plain' })
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
