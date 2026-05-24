import { useApp } from '../../context/AppContext'

export default function FeatureLibrary() {
  const { state } = useApp()
  const entries = Object.entries(state.featureLibrary ?? {})

  if (entries.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase text-gray-400">
        Biblioteca de características
      </h2>

      <div className="flex flex-col gap-1 text-xs">
        {entries.map(([codigo, feature]) => {
          if (!feature) return null
          return (
            <div
              key={codigo}
              className="flex items-center gap-2 bg-gray-800 rounded px-2 py-1"
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0 border border-gray-600"
                style={{ backgroundColor: feature.color ?? '#ffffff' }}
              />
              <span className="font-mono font-semibold">{codigo}</span>
              {feature.capa && feature.capa !== codigo && (
                <span className="ml-auto text-gray-500 truncate">{feature.capa}</span>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
