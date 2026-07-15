// Modal que se muestra al cargar la app cuando hay una sesión guardada en
// localStorage, ofreciendo continuarla o empezar de cero.

const STAGE_LABELS = {
  preview: 'Importar',
  detecting: 'Importar',
  codes_ready: 'Capas',
  processing: 'Resultado',
  ready: 'Resultado',
  viewer: 'Vista',
}

export default function ResumeSessionModal({ fileName, appMode, onContinue, onDiscard }) {
  const stageLabel = STAGE_LABELS[appMode] ?? 'Importar'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white">Sesión anterior encontrada</h2>
        <p className="mt-2 text-sm text-gray-400">
          Tienes trabajo sin terminar
          {fileName ? (
            <>
              {' '}con <span className="font-mono text-gray-200">{fileName}</span>
            </>
          ) : null}
          , detenido en la etapa{' '}
          <span className="font-semibold text-gray-200">{stageLabel}</span>.
          ¿Quieres continuarla?
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onDiscard}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 transition-colors"
          >
            Empezar de nuevo
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 transition-colors"
          >
            Continuar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
