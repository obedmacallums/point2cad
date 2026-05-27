import { useApp } from '../../context/AppContext'

export default function FeatureLibrary() {
  const { state, dispatch } = useApp()
  const entries = Object.entries(state.featureLibrary ?? {})
  const isViewer = state.appMode === 'viewer'

  if (entries.length === 0) return null

  function toggleVisibility(codigo, checked) {
    dispatch({
      type: 'UPDATE_FEATURE',
      payload: { codigo, changes: { visible: checked } },
    })
  }

  function toggleLineVertices(checked) {
    dispatch({ type: 'SET_SHOW_LINE_VERTICES', payload: checked })
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase text-gray-400">
        Biblioteca de características
      </h2>

      <div className="flex flex-col gap-1 text-xs">
        {entries.map(([codigo, feature]) => {
          if (!feature) return null
          const visible = feature.visible !== false
          const rowClass = `flex items-center gap-2 bg-gray-800 rounded px-2 py-1 transition-opacity ${
            isViewer && !visible ? 'opacity-50' : ''
          }`
          return (
            <div key={codigo} className={rowClass}>
              <span
                className="w-3 h-3 rounded-full flex-shrink-0 border border-gray-600"
                style={{ backgroundColor: feature.color ?? '#ffffff' }}
              />
              <span className="font-mono font-semibold">{codigo}</span>
              {feature.capa && feature.capa !== codigo && (
                <span className="text-gray-500 truncate">{feature.capa}</span>
              )}
              {isViewer && (
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(e) => toggleVisibility(codigo, e.target.checked)}
                  className="ml-auto w-4 h-4 accent-emerald-500 cursor-pointer"
                  aria-label={`Mostrar capa ${codigo}`}
                />
              )}
            </div>
          )
        })}

        {isViewer && (
          <label className="flex items-center gap-2 bg-gray-800 rounded px-2 py-1 mt-1 cursor-pointer">
            <span className="text-gray-300">Mostrar vértices de líneas</span>
            <input
              type="checkbox"
              checked={state.showLineVertices === true}
              onChange={(e) => toggleLineVertices(e.target.checked)}
              className="ml-auto w-4 h-4 accent-emerald-500 cursor-pointer"
              aria-label="Mostrar vértices de líneas"
            />
          </label>
        )}
      </div>
    </section>
  )
}
