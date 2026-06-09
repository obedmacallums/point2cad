// src/components/FxlImport/FxlImport.jsx
import { useRef } from 'react'
import { useApp } from '../../context/AppContext'
import { useFxlLoader } from '../../hooks/useFxlLoader'

// Bloque opcional (en la etapa de importación) para cargar una biblioteca de
// características Trimble (.fxl) que aporta el usuario. Siembra capa/color/tipo y
// roles de control con prioridad sobre la heurística (no sobre ediciones manuales).
export default function FxlImport() {
  const { state, dispatch } = useApp()
  const { loadFxl, error, loading } = useFxlLoader()
  const inputRef = useRef(null)
  const fxl = state.fxl

  async function handleChange(e) {
    const file = e.target.files[0]
    await loadFxl(file)
    if (inputRef.current) inputRef.current.value = ''
  }

  const codeCount = fxl ? Object.keys(fxl.features ?? {}).length : 0
  const ctrlCount = fxl ? Object.keys(fxl.controlRoles ?? {}).length : 0

  return (
    <section className="flex flex-col gap-1 text-xs">
      <h3 className="text-sm font-semibold text-gray-300">
        Biblioteca de características (.fxl)
      </h3>

      {fxl ? (
        <div className="flex items-center gap-2 bg-gray-800 rounded px-2 py-1.5">
          <span className="text-gray-200 truncate">{fxl.fileName}</span>
          <span className="text-gray-500">
            · {codeCount} códigos · {ctrlCount} control codes
          </span>
          <button
            onClick={() => dispatch({ type: 'CLEAR_FXL' })}
            className="ml-auto text-gray-400 hover:text-white"
          >
            Quitar
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current.click()}
          disabled={loading}
          className="w-full py-1.5 px-2 rounded border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white disabled:opacity-50 transition-colors"
        >
          {loading ? 'Leyendo .fxl…' : 'Importar biblioteca (.fxl) — opcional'}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".fxl"
        onChange={handleChange}
        className="hidden"
      />

      {error && <p className="text-red-400">{error}</p>}
    </section>
  )
}
