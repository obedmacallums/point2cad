import { useCallback } from 'react'
import { useApp } from '../context/AppContext'

// Etapas visibles del flujo, en orden.
export const STAGES = [
  { id: 'import', label: 'Importar' },
  { id: 'detect', label: 'Capas' },
  { id: 'process', label: 'Resultado' },
  { id: 'visualize', label: 'Vista 3D' },
]

const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s.id, i]))

// appMode → etapa a la que pertenece (los modos transitorios comparten etapa).
const MODE_TO_STAGE = {
  idle: null,
  preview: 'import',
  detecting: 'import',
  codes_ready: 'detect',
  processing: 'process',
  ready: 'process',
  viewer: 'visualize',
}

// Modo representativo al que se vuelve al retroceder a una etapa.
const STAGE_TO_MODE = {
  import: 'preview',
  detect: 'codes_ready',
  process: 'ready',
  visualize: 'viewer',
}

// El stepper solo permite RETROCEDER a etapas ya visitadas. El avance a la
// siguiente etapa se hace exclusivamente con el botón principal de cada
// pantalla (junto a "Cancelar"). Así las etapas posteriores se habilitan de a
// una a medida que el usuario avanza.
export function useStageNavigation() {
  const { state, dispatch } = useApp()

  const currentStage = MODE_TO_STAGE[state.appMode]
  const currentIndex = currentStage != null ? STAGE_INDEX[currentStage] : -1
  const busy =
    state.appMode === 'detecting' ||
    state.appMode === 'processing' ||
    state.isProcessing

  // Estado visual de cada etapa: 'active' | 'completed' | 'disabled'.
  // Solo las etapas anteriores a la actual ('completed') son clickeables.
  const stageStatus = useCallback(
    (stageId) => {
      const idx = STAGE_INDEX[stageId]
      if (idx === currentIndex) return 'active'
      return idx < currentIndex ? 'completed' : 'disabled'
    },
    [currentIndex],
  )

  // Navega hacia atrás a una etapa anterior ya alcanzada.
  const goToStage = useCallback(
    (stageId) => {
      if (busy) return
      const idx = STAGE_INDEX[stageId]
      if (idx >= currentIndex) return // no se avanza ni se re-activa desde aquí
      dispatch({ type: 'SET_MODE', payload: STAGE_TO_MODE[stageId] })
    },
    [busy, currentIndex, dispatch],
  )

  return { currentStage, stageStatus, goToStage, busy }
}
