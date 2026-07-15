import { describe, it, expect } from 'vitest'
import { STAGES } from './useStageNavigation'

describe('STAGES', () => {
  it('la etapa visualize se etiqueta "Vista" (sin "3D")', () => {
    const visualize = STAGES.find((s) => s.id === 'visualize')
    expect(visualize).toBeDefined()
    expect(visualize.label).toBe('Vista')
  })

  it('conserva los ids y el orden del flujo', () => {
    expect(STAGES.map((s) => s.id)).toEqual([
      'import', 'detect', 'process', 'visualize',
    ])
  })
})
