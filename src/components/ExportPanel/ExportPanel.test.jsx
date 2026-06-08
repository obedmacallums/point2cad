import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ExportPanel, { availableFormats } from './ExportPanel'
import { useApp } from '../../context/AppContext'
import { usePyodide } from '../../context/PyodideContext'
import { usePythonBridge } from '../../hooks/usePythonBridge'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../context/PyodideContext', () => ({ usePyodide: vi.fn() }))
vi.mock('../../hooks/usePythonBridge', () => ({ usePythonBridge: vi.fn() }))

function mockState(coordSystem) {
  return {
    appMode: 'import',
    points: [{ x: 1, y: 2, z: 0, codigo: 'A', nombre: 'P1' }],
    lines: [],
    polylines: [],
    featureLibrary: { A: { capa: 'A', color: '#fff' } },
    parseOptions: { coordSystem },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  usePythonBridge.mockReturnValue({ exportGeometry: vi.fn(), isRunning: false })
  usePyodide.mockReturnValue({ isPackagesReady: () => true })
})

describe('availableFormats', () => {
  it('incluye GeoJSON solo en coordenadas geodésicas', () => {
    expect(availableFormats('geodetic').map((o) => o.value)).toContain('geojson')
    expect(availableFormats('projected').map((o) => o.value)).not.toContain(
      'geojson',
    )
  })

  it('mantiene el resto de formatos en ambos casos', () => {
    for (const cs of ['geodetic', 'projected']) {
      const values = availableFormats(cs).map((o) => o.value)
      expect(values).toEqual(expect.arrayContaining(['dxf', 'shapefile', 'geopackage']))
    }
  })
})

describe('ExportPanel — disponibilidad de GeoJSON', () => {
  it('ofrece GeoJSON cuando el CSV es geodésico', () => {
    useApp.mockReturnValue({ state: mockState('geodetic') })
    render(<ExportPanel />)
    expect(screen.getByRole('option', { name: 'GeoJSON' })).toBeInTheDocument()
  })

  it('oculta GeoJSON cuando el CSV es proyectado (plano)', () => {
    useApp.mockReturnValue({ state: mockState('projected') })
    render(<ExportPanel />)
    expect(screen.queryByRole('option', { name: 'GeoJSON' })).not.toBeInTheDocument()
    // Los demás formatos siguen disponibles.
    expect(screen.getByRole('option', { name: 'DXF' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /GeoPackage/ })).toBeInTheDocument()
  })
})
