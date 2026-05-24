import { usePythonBridge } from '../../hooks/usePythonBridge'
import { useApp } from '../../context/AppContext'

export default function ExportPanel() {
  const { exportDXF, isRunning } = usePythonBridge()
  const { state } = useApp()

  const hasGeometry =
    state.points.length > 0 ||
    state.lines.length > 0 ||
    state.polylines.length > 0

  if (!hasGeometry) return null

  async function handleExport() {
    const geometry = {
      points: state.points,
      lines: state.lines,
      polylines: state.polylines,
    }
    await exportDXF(geometry, state.featureLibrary, state.fileName ?? 'output.csv')
  }

  return (
    <section className="flex flex-col gap-2 mt-auto">
      <button
        onClick={handleExport}
        disabled={isRunning}
        className="w-full py-2 px-3 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
      >
        {isRunning ? 'Generando DXF…' : 'Exportar DXF'}
      </button>
    </section>
  )
}
