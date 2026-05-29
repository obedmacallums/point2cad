import { useApp } from '../../context/AppContext'

export default function ResultsPanel() {
  const { state, dispatch } = useApp()

  const totalGeometry =
    state.points.length + state.lines.length + state.polylines.length

  const stats = [
    { label: 'Puntos', value: state.points.length, color: 'text-green-400' },
    { label: 'Líneas', value: state.lines.length, color: 'text-yellow-400' },
    { label: 'Polilíneas cerradas', value: state.polylines.length, color: 'text-purple-400' },
  ]

  return (
    <div className="flex flex-col gap-6 p-6 h-full bg-gray-950">
      {/* Encabezado con acciones a la derecha (mismo patrón que CSVPreview) */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">{state.fileName}</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {totalGeometry} entidades generadas
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => dispatch({ type: 'RESET' })}
            className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => dispatch({ type: 'SET_MODE', payload: 'viewer' })}
            className="px-4 py-1.5 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500 transition-colors"
          >
            Ver en 3D
          </button>
        </div>
      </div>

      {/* Resumen de geometría, centrado */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm text-gray-300">
            {totalGeometry} entidades generadas
          </p>
        </div>

        <div className="flex gap-6">
          {stats.map(({ label, value, color }) => (
            <div key={label} className="flex flex-col items-center gap-1 bg-gray-800 rounded-xl px-6 py-4 min-w-[100px]">
              <span className={`text-3xl font-bold tabular-nums ${color}`}>{value}</span>
              <span className="text-xs text-gray-400">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
