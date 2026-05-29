import { STAGES, useStageNavigation } from '../../hooks/useStageNavigation'

// Estilos por estado de paso.
const STEP_STYLE = {
  active: 'bg-blue-600 text-white border-blue-500',
  completed: 'bg-green-600/20 text-green-300 border-green-700 hover:border-green-500',
  disabled: 'bg-gray-900 text-gray-600 border-gray-800 cursor-not-allowed',
}

export default function StageStepper() {
  const { stageStatus, goToStage, busy } = useStageNavigation()

  return (
    <nav className="flex items-center gap-2 px-6 py-3 border-b border-gray-800 bg-gray-900 flex-shrink-0">
      {STAGES.map((stage, i) => {
        const status = stageStatus(stage.id)
        const clickable = status === 'completed' && !busy

        return (
          <div key={stage.id} className="flex items-center gap-2">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && goToStage(stage.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${STEP_STYLE[status]} ${clickable ? '' : 'cursor-default'}`}
            >
              <span
                className={`flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                  status === 'active'
                    ? 'bg-white/20'
                    : status === 'completed'
                      ? 'bg-green-500/30'
                      : 'bg-black/30'
                }`}
              >
                {status === 'completed' ? '✓' : i + 1}
              </span>
              {stage.label}
            </button>
            {i < STAGES.length - 1 && (
              <span className="text-gray-700 select-none">→</span>
            )}
          </div>
        )
      })}
    </nav>
  )
}
