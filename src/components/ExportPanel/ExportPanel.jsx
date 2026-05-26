import { usePythonBridge } from '../../hooks/usePythonBridge'
import { useApp } from '../../context/AppContext'

export default function ExportPanel() {
  const { exportDXF, isRunning } = usePythonBridge()
  const { state } = useApp()

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

  const hasGeometry =
    points.length > 0 || lines.length > 0 || polylines.length > 0

  const hasAnyGeometry =
    state.points.length > 0 ||
    state.lines.length > 0 ||
    state.polylines.length > 0

  if (!hasAnyGeometry) return null

  async function handleExport() {
    const geometry = { points, lines, polylines }
    await exportDXF(geometry, featureLibrary, state.fileName ?? 'output.csv')
  }

  const label = isRunning
    ? 'Generando DXF…'
    : isViewer
      ? 'Exportar selección'
      : 'Exportar DXF'

  return (
    <section className="flex flex-col gap-2 mt-auto">
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
