import { useRef } from 'react'
import { useApp } from '../../context/AppContext'
import { useCSVLoader } from '../../hooks/useCSVLoader'

export default function FileUpload() {
  const inputRef = useRef(null)
  const { state } = useApp()
  const { loadFile } = useCSVLoader()

  async function handleFileChange(e) {
    const file = e.target.files[0]
    await loadFile(file)
    inputRef.current.value = ''
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase text-gray-400">Importar CSV</h2>

      <button
        onClick={() => inputRef.current.click()}
        className="w-full py-2 px-3 rounded bg-blue-600 hover:bg-blue-500 text-sm font-medium transition-colors"
      >
        {state.appMode === 'ready' || state.appMode === 'viewer'
          ? 'Cargar otro archivo'
          : 'Seleccionar archivo CSV'}
      </button>

      <input ref={inputRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />

      {state.error && state.appMode === 'idle' && (
        <p className="text-xs text-red-400">{state.error}</p>
      )}
    </section>
  )
}
