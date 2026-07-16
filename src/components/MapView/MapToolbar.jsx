import { useMap } from 'react-leaflet'

// Mismo ícono "cuatro esquinas" que el botón "Ajustar vista" de ViewerToolbar
// (src/components/Viewer3D/ViewerToolbar.jsx), para leerse como el mismo
// concepto en 3D y en mapa.
const FIT_ICON = (
  <path d="M3 7 V3 H7 M13 3 H17 V7 M17 13 V17 H13 M7 17 H3 V13" />
)

export default function MapToolbar({ bounds }) {
  const map = useMap()
  const disabled = !bounds

  return (
    <div className="absolute top-2.5 right-2.5 z-[500] flex flex-col gap-px bg-gray-900/60 backdrop-blur-sm rounded p-px">
      <button
        type="button"
        onClick={() => bounds && map.fitBounds(bounds, { padding: [24, 24] })}
        disabled={disabled}
        title={disabled ? 'Sin geometría visible que encuadrar' : 'Ajustar vista'}
        aria-label="Ajustar vista"
        className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {FIT_ICON}
        </svg>
      </button>
    </div>
  )
}
