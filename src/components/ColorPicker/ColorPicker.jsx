import { useEffect, useRef, useState } from 'react'

// Paleta rápida: colores ACI clásicos de AutoCAD + negro.
const QUICK_COLORS = [
  { hex: '#ff0000', name: 'Rojo' },
  { hex: '#ffff00', name: 'Amarillo' },
  { hex: '#00ff00', name: 'Verde' },
  { hex: '#00ffff', name: 'Cian' },
  { hex: '#0000ff', name: 'Azul' },
  { hex: '#ff00ff', name: 'Magenta' },
  { hex: '#ffffff', name: 'Blanco' },
  { hex: '#000000', name: 'Negro' },
]

export default function ColorPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const nativeInputRef = useRef(null)

  // Cerrar al hacer click fuera o pulsar Esc.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function handleQuickPick(hex) {
    onChange(hex)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-full border-2 border-gray-600 hover:border-gray-400 pl-0.5 pr-1.5 py-0.5 bg-gray-900 transition-colors"
        title="Elegir color"
      >
        <span
          className="w-5 h-5 rounded-full border border-gray-700"
          style={{ backgroundColor: value }}
        />
        <span className="text-[9px] text-gray-400">▾</span>
      </button>

      {open && (
        <div className="absolute z-20 top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-2 flex flex-col gap-2 w-44">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Colores comunes
            </p>
            <div className="grid grid-cols-4 gap-1">
              {QUICK_COLORS.map(({ hex, name }) => {
                const selected = value.toLowerCase() === hex.toLowerCase()
                return (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => handleQuickPick(hex)}
                    title={name}
                    className={`w-7 h-7 rounded transition-transform hover:scale-110 ${
                      selected
                        ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-800'
                        : 'border border-gray-700'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                )
              })}
            </div>
          </div>

          <div className="border-t border-gray-700 pt-2">
            <button
              type="button"
              onClick={() => nativeInputRef.current?.click()}
              className="w-full text-[11px] text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded px-2 py-1 transition-colors"
            >
              Color personalizado…
            </button>
            <input
              ref={nativeInputRef}
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="sr-only"
            />
          </div>
        </div>
      )}
    </div>
  )
}
