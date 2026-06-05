import { useApp } from '../../context/AppContext'

// Iconos minimalistas que representan cada tipo de entidad geométrica.
function PointIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="7" opacity="0.4" />
    </svg>
  )
}

function LineIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 17 L10 8 L15 14 L20 6" />
      <circle cx="4" cy="17" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="20" cy="6" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

function PolygonIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4 L19 9 L16 18 L8 18 L5 9 Z" />
    </svg>
  )
}

export default function ResultsPanel() {
  const { state, dispatch } = useApp()

  const totalGeometry =
    state.points.length + state.lines.length + state.polylines.length

  const stats = [
    { label: 'Puntos', value: state.points.length, color: 'text-green-400', Icon: PointIcon },
    { label: 'Líneas', value: state.lines.length, color: 'text-yellow-400', Icon: LineIcon },
    { label: 'Polilíneas cerradas', value: state.polylines.length, color: 'text-purple-400', Icon: PolygonIcon },
  ]

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 h-full bg-gray-950">
      {/* Encabezado con acciones a la derecha (mismo patrón que CSVPreview) */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
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
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center animate-check-pop">
            <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm text-gray-300 animate-fade-up">
            {totalGeometry} entidades generadas
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
          {stats.map(({ label, value, color, Icon }) => (
            <div key={label} className="flex flex-col items-center gap-2 bg-gray-800 rounded-xl px-6 py-4 min-w-[110px]">
              <Icon className={`w-6 h-6 ${color} opacity-80`} />
              <span className={`text-3xl font-bold tabular-nums ${color}`}>{value}</span>
              <span className="text-xs text-gray-400">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
