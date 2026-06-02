import { useState } from 'react'
import { usePythonBridge } from '../../hooks/usePythonBridge'
import { useApp } from '../../context/AppContext'

// Formatos disponibles en el desplegable (DXF queda por defecto).
const FORMAT_OPTIONS = [
  { value: 'dxf', label: 'DXF' },
  { value: 'geojson', label: 'GeoJSON' },
  { value: 'shapefile', label: 'Shapefile (ZIP)' },
]

export default function ExportPanel() {
  const { exportGeometry, isRunning } = usePythonBridge()
  const { state } = useApp()
  const [format, setFormat] = useState('dxf')
  const [includeLabels, setIncludeLabels] = useState(true)

  const isViewer = state.appMode === 'viewer'

  const isCodeVisible = (codigo) =>
    state.featureLibrary[codigo]?.visible !== false

  const points = isViewer
    ? state.points.filter((p) => isCodeVisible(p.codigo))
    : state.points
  const lines = isViewer
    ? state.lines.filter((l) => isCodeVisible(l.codigo))
    : state.lines
  const polylines = isViewer
    ? state.polylines.filter((pl) => isCodeVisible(pl.codigo))
    : state.polylines

  const featureLibrary = isViewer
    ? Object.fromEntries(
        Object.entries(state.featureLibrary).filter(([codigo]) =>
          isCodeVisible(codigo),
        ),
      )
    : state.featureLibrary

  // Cuando el viewer 3D tiene activado "Mostrar vértices de líneas", también
  // exportamos los vértices al DXF como POINT en una sub-capa con sufijo _VERT
  // (BORDE → BORDE_VERT). Cada nuevo código hereda el color de la línea padre.
  // nombre: '' evita que dxf_generator agregue TEXT por cada vértice.
  const showVertices = isViewer && state.showLineVertices === true

  let exportPoints = points
  let exportFeatureLibrary = featureLibrary

  if (showVertices) {
    const vertexPoints = []
    const vertexCodes = {}
    const addVertices = (entity) => {
      const parent = state.featureLibrary[entity.codigo]
      if (!parent) return
      const vertCode = `${entity.codigo}_VERT`
      if (!(vertCode in vertexCodes)) {
        vertexCodes[vertCode] = {
          color: parent.color,
          capa: `${parent.capa ?? entity.codigo}_VERT`,
        }
      }
      for (const v of entity.vertices) {
        vertexPoints.push({
          x: v[0],
          y: v[1],
          z: v[2],
          codigo: vertCode,
          nombre: '',
        })
      }
    }
    for (const line of lines) addVertices(line)
    for (const pl of polylines) addVertices(pl)
    exportPoints = [...points, ...vertexPoints]
    exportFeatureLibrary = { ...featureLibrary, ...vertexCodes }
  }

  const hasGeometry =
    points.length > 0 || lines.length > 0 || polylines.length > 0

  const hasAnyGeometry =
    state.points.length > 0 ||
    state.lines.length > 0 ||
    state.polylines.length > 0

  if (!hasAnyGeometry) return null

  async function handleExport() {
    const geometry = { points: exportPoints, lines, polylines }
    await exportGeometry(
      format,
      geometry,
      exportFeatureLibrary,
      state.fileName ?? 'output.csv',
      { include_labels: includeLabels },
    )
  }

  const formatLabel =
    FORMAT_OPTIONS.find((o) => o.value === format)?.label ?? 'DXF'
  const label = isRunning
    ? `Generando ${formatLabel}…`
    : isViewer
      ? 'Exportar selección'
      : `Exportar ${formatLabel}`

  return (
    <section className="flex flex-col gap-2 mt-auto">
      <label className="flex flex-col gap-1 text-xs text-gray-400">
        Formato de exportación
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          disabled={isRunning}
          className="w-full py-1.5 px-2 rounded bg-gray-800 border border-gray-700 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 cursor-pointer"
        >
          {FORMAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {/* La casilla solo aplica a DXF, pero se reserva su espacio siempre
          (invisible en otros formatos) para que el panel no salte al cambiar. */}
      <label
        className={`flex items-center gap-2 text-xs text-gray-300 cursor-pointer ${
          format === 'dxf' ? '' : 'invisible'
        }`}
      >
        <input
          type="checkbox"
          checked={includeLabels}
          onChange={(e) => setIncludeLabels(e.target.checked)}
          disabled={isRunning || format !== 'dxf'}
          className="accent-emerald-500"
        />
        Incluir etiquetas de nombre
      </label>
      <button
        onClick={handleExport}
        disabled={isRunning || !hasGeometry}
        className="w-full py-2 px-3 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
      >
        {label}
      </button>
    </section>
  )
}
