// Panel top-left del viewer 3D que muestra la medición entre 2 puntos.
// Recibe measurePoints = [p1, p2] (cada uno puede ser null).
// Coordenadas en espacio CSV (x=Este, y=Norte, z=Elevación) — no Three.js.

function format(n) {
  return `${n.toFixed(2)} m`
}

function labelOf(pt) {
  return pt?.nombre ?? 'Vértice'
}

export default function MeasurementOverlay({ measurePoints, onClose }) {
  const [p1, p2] = measurePoints

  let body
  if (!p1) {
    body = <div className="text-gray-300">Click el primer punto</div>
  } else if (!p2) {
    body = (
      <div className="text-gray-300">
        <span className="font-mono font-semibold text-white">{labelOf(p1)}</span>
        <span className="text-gray-500"> → click el segundo punto</span>
      </div>
    )
  } else {
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const dz = p2.z - p1.z
    const distance3D = Math.hypot(dx, dy, dz)
    const planimetric = Math.hypot(dx, dy)
    const deltaZ = Math.abs(dz)

    body = (
      <>
        <div className="font-mono font-semibold text-white">
          {labelOf(p1)} <span className="text-gray-500">→</span> {labelOf(p2)}
        </div>
        <div className="h-px bg-white/10 my-2" />
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <span className="text-gray-400">Distancia 3D</span>
          <span className="font-mono text-right text-white">{format(distance3D)}</span>
          <span className="text-gray-400">Plana (XY)</span>
          <span className="font-mono text-right text-white">{format(planimetric)}</span>
          <span className="text-gray-400">ΔZ</span>
          <span className="font-mono text-right text-white">{format(deltaZ)}</span>
        </div>
      </>
    )
  }

  return (
    <div className="absolute top-3 left-3 bg-gray-900/90 backdrop-blur-sm rounded px-3 py-2 text-xs min-w-[180px] shadow-lg border border-white/5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="uppercase tracking-wide text-[10px] text-gray-500">
          Medición
        </span>
        <button
          type="button"
          onClick={onClose}
          className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-white leading-none"
          aria-label="Cerrar medición"
          title="Cerrar (Esc)"
        >
          ×
        </button>
      </div>
      {body}
    </div>
  )
}
