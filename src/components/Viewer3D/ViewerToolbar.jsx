const BUTTONS = [
  {
    id: 'top',
    label: 'Vista superior',
    // Cuadrado visto desde arriba
    path: (
      <rect x="4" y="4" width="12" height="12" rx="1" />
    ),
  },
  {
    id: 'front',
    label: 'Vista frontal',
    // Rectángulo más ancho que alto, vista frontal
    path: (
      <rect x="3" y="6" width="14" height="8" rx="1" />
    ),
  },
  {
    id: 'side',
    label: 'Vista lateral',
    // Rectángulo más alto que ancho
    path: (
      <rect x="6" y="3" width="8" height="14" rx="1" />
    ),
  },
  {
    id: 'iso',
    label: 'Vista isométrica',
    // Hexágono = cubo isométrico
    path: (
      <path d="M10 2.5 L17 6.25 L17 13.75 L10 17.5 L3 13.75 L3 6.25 Z M10 2.5 L10 17.5 M3 6.25 L17 6.25 M3 13.75 L17 13.75" />
    ),
  },
  {
    id: 'fit',
    label: 'Ajustar vista',
    // Cuatro corners apuntando hacia adentro
    path: (
      <path d="M3 7 V3 H7 M13 3 H17 V7 M17 13 V17 H13 M7 17 H3 V13" />
    ),
  },
]

export default function ViewerToolbar({ onSetView }) {
  return (
    <div className="absolute top-3 right-3 flex flex-col gap-px bg-gray-900/60 backdrop-blur-sm rounded p-px">
      {BUTTONS.map((btn) => (
        <button
          key={btn.id}
          type="button"
          onClick={() => onSetView(btn.id)}
          title={btn.label}
          aria-label={btn.label}
          className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
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
            {btn.path}
          </svg>
        </button>
      ))}
    </div>
  )
}
