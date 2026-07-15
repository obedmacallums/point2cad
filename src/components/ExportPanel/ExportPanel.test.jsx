import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ExportPanel, { availableFormats } from './ExportPanel'
import { useApp } from '../../context/AppContext'
import { usePyodide } from '../../context/PyodideContext'
import { usePythonBridge } from '../../hooks/usePythonBridge'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../context/PyodideContext', () => ({ usePyodide: vi.fn() }))
vi.mock('../../hooks/usePythonBridge', () => ({ usePythonBridge: vi.fn() }))

function mockState(parseOptions, rows = [], mapping = {}) {
  return {
    appMode: 'import',
    points: [{ x: 1, y: 2, z: 0, codigo: 'A', nombre: 'P1' }],
    lines: [],
    polylines: [],
    featureLibrary: { A: { capa: 'A', color: '#fff' } },
    parseOptions,
    rawCSVRows: rows,
    columnMapping: { nombre: 'n', x: 'x', y: 'y', z: 'z', codigo: 'c', ...mapping },
    disabledRows: [],
  }
}

const geodeticState = () =>
  mockState(
    { coordSystem: 'geodetic', utmZone: 'auto', hemisphere: 'auto' },
    [{ x: '-70.62', y: '-33.44' }],
  )

const localState = () =>
  mockState({ coordSystem: 'projected', projectedCrs: 'local' })

const declaredUtmState = () =>
  mockState({
    coordSystem: 'projected',
    projectedCrs: 'utm',
    utmZone: '18',
    hemisphere: 'S',
  })

beforeEach(() => {
  vi.clearAllMocks()
  usePythonBridge.mockReturnValue({ exportGeometry: vi.fn(), isRunning: false })
  usePyodide.mockReturnValue({ isPackagesReady: () => true })
})

describe('availableFormats', () => {
  it('con CRS habilita todos los formatos', () => {
    const opts = availableFormats(true)
    expect(opts.map((o) => o.value)).toEqual([
      'dxf', 'geojson', 'kml', 'shapefile', 'geopackage',
    ])
    expect(opts.every((o) => !o.disabled)).toBe(true)
  })

  it('sin CRS deshabilita los formatos WGS84 (GeoJSON, KML) y mantiene el resto', () => {
    const opts = availableFormats(false)
    const byValue = Object.fromEntries(opts.map((o) => [o.value, o]))
    expect(byValue.geojson.disabled).toBe(true)
    expect(byValue.kml.disabled).toBe(true)
    expect(byValue.dxf.disabled).toBeUndefined()
    expect(byValue.shapefile.disabled).toBeUndefined()
    expect(byValue.geopackage.disabled).toBeUndefined()
  })
})

describe('ExportPanel — disponibilidad de formatos WGS84', () => {
  it('geodésico: GeoJSON y KML habilitados', () => {
    useApp.mockReturnValue({ state: geodeticState() })
    render(<ExportPanel />)
    expect(screen.getByRole('option', { name: 'GeoJSON' })).toBeEnabled()
    expect(screen.getByRole('option', { name: /KML/ })).toBeEnabled()
  })

  it('plano sin CRS declarado: GeoJSON y KML deshabilitados con motivo visible', () => {
    useApp.mockReturnValue({ state: localState() })
    render(<ExportPanel />)
    expect(screen.getByRole('option', { name: /GeoJSON/ })).toBeDisabled()
    expect(screen.getByRole('option', { name: /KML/ })).toBeDisabled()
    expect(screen.getByRole('option', { name: 'DXF' })).toBeEnabled()
    expect(
      screen.getByText(/necesitan un sistema de coordenadas conocido/),
    ).toBeInTheDocument()
  })

  it('plano con UTM declarado: GeoJSON y KML habilitados', () => {
    useApp.mockReturnValue({ state: declaredUtmState() })
    render(<ExportPanel />)
    expect(screen.getByRole('option', { name: 'GeoJSON' })).toBeEnabled()
    expect(screen.getByRole('option', { name: /KML/ })).toBeEnabled()
    expect(
      screen.queryByText(/necesitan un sistema de coordenadas conocido/),
    ).not.toBeInTheDocument()
  })
})
