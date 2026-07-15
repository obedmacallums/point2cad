import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ViewerStage from './ViewerStage'
import { useApp } from '../../context/AppContext'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../Viewer3D/Viewer3D', () => ({ default: () => <div data-testid="viewer3d" /> }))
vi.mock('../MapView/MapView', () => ({ default: () => <div data-testid="mapview" /> }))

const baseState = (parseOptions) => ({
  points: [{ x: 345000, y: 6300000, z: 0, codigo: 'A', nombre: 'P1' }],
  lines: [],
  polylines: [],
  featureLibrary: { A: { color: '#fff', capa: 'A' } },
  fileName: 'f.csv',
  rawCSVRows: [{ x: '-70.6', y: '-33.4' }],
  columnMapping: { x: 'x', y: 'y' },
  parseOptions,
  disabledRows: [],
})

const withCrs = () =>
  baseState({ coordSystem: 'geodetic', utmZone: 'auto', hemisphere: 'auto' })
const withoutCrs = () =>
  baseState({ coordSystem: 'projected', projectedCrs: 'local' })

beforeEach(() => vi.clearAllMocks())

describe('ViewerStage', () => {
  it('por defecto muestra el visor 3D y no monta el mapa', () => {
    useApp.mockReturnValue({ state: withCrs() })
    render(<ViewerStage />)
    expect(screen.getByTestId('viewer3d')).toBeInTheDocument()
    expect(screen.queryByTestId('mapview')).not.toBeInTheDocument()
  })

  it('sin CRS deshabilita "Mapa" con el motivo en title', () => {
    useApp.mockReturnValue({ state: withoutCrs() })
    render(<ViewerStage />)
    const btn = screen.getByRole('button', { name: 'Mapa' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', 'Requiere CRS — decláralo en Importar CSV')
  })

  it('con CRS habilita "Mapa" y al pulsarlo monta y muestra el mapa', () => {
    useApp.mockReturnValue({ state: withCrs() })
    render(<ViewerStage />)
    const btn = screen.getByRole('button', { name: 'Mapa' })
    expect(btn).toBeEnabled()
    fireEvent.click(btn)
    expect(screen.getByTestId('mapview')).toBeInTheDocument()
  })

  it('si el CRS desaparece estando en mapa, vuelve a 3D (fallback) y deshabilita "Mapa"', () => {
    useApp.mockReturnValue({ state: withCrs() })
    const { rerender } = render(<ViewerStage />)
    fireEvent.click(screen.getByRole('button', { name: 'Mapa' }))
    // El mapa quedó montado (oculto tras el fallback) pero "Mapa" se deshabilita.
    useApp.mockReturnValue({ state: withoutCrs() })
    rerender(<ViewerStage />)
    expect(screen.getByRole('button', { name: 'Mapa' })).toBeDisabled()
    // Wrapper del mapa oculto; el del 3D visible.
    expect(screen.getByTestId('mapview').parentElement.className).toContain('hidden')
    expect(screen.getByTestId('viewer3d').parentElement.className).not.toContain('hidden')
  })
})
