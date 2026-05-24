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
    <div className="flex flex-col items-center justify-center h-full gap-8 bg-gray-950 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-2">
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-white">{state.fileName}</h2>
        <p className="text-sm text-gray-400">
          {totalGeometry} entidades generadas
        </p>
      </div>

      {/* Resumen de geometría */}
      <div className="flex gap-6">
        {stats.map(({ label, value, color }) => (
          <div key={label} className="flex flex-col items-center gap-1 bg-gray-800 rounded-xl px-6 py-4 min-w-[100px]">
            <span className={`text-3xl font-bold tabular-nums ${color}`}>{value}</span>
            <span className="text-xs text-gray-400">{label}</span>
          </div>
        ))}
      </div>

      {/* Acciones */}
      <div className="flex gap-3">
        <button
          onClick={() => dispatch({ type: 'RESET' })}
          className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 transition-colors"
        >
          Cargar otro archivo
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_MODE', payload: 'viewer' })}
          className="px-6 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors"
        >
          Ver en 3D
        </button>
      </div>
    </div>
  )
}
