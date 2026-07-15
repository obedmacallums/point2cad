import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import MapView from './MapView'
import { useApp } from '../../context/AppContext'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))

// react-leaflet mockeado: cada componente renderiza un marcador simple que
// expone el color por data-attr, para poder contar capas por tipo.
vi.mock('react-leaflet', () => {
  const Base = ({ children }) => <div>{children}</div>
  const LayersControl = ({ children }) => <div>{children}</div>
  LayersControl.BaseLayer = ({ children }) => <div>{children}</div>
  return {
    MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
    TileLayer: ({ url }) => <div data-testid="tile" data-url={url} />,
    LayersControl,
    CircleMarker: ({ children, pathOptions }) => (
      <div data-testid="circle" data-color={pathOptions.color}>{children}</div>
    ),
    Polyline: ({ children, pathOptions }) => (
      <div data-testid="polyline" data-color={pathOptions.color}>{children}</div>
    ),
    Polygon: ({ children, pathOptions }) => (
      <div data-testid="polygon" data-color={pathOptions.color}>{children}</div>
    ),
    Popup: Base,
    useMap: () => ({ invalidateSize: vi.fn(), fitBounds: vi.fn(), on: vi.fn(), off: vi.fn() }),
  }
})

// CSS de Leaflet: no aporta nada a los tests.
vi.mock('leaflet/dist/leaflet.css', () => ({}))

function mockState() {
  return {
    points: [
      { x: 345000, y: 6300000, z: 500, codigo: 'ARB', nombre: 'P1' },
      { x: 345010, y: 6300010, z: 501, codigo: 'OCULTO', nombre: 'P2' },
    ],
    lines: [{ codigo: 'BORDE', vertices: [[345000, 6300000, 0], [345020, 6300020, 0]] }],
    polylines: [{ codigo: 'LOTE', vertices: [[345000, 6300000, 0], [345020, 6300000, 0], [345020, 6300020, 0]] }],
    featureLibrary: {
      ARB: { color: '#22c55e', capa: 'ARBOLES', visible: true },
      OCULTO: { color: '#ef4444', capa: 'OCULTO', visible: false },
      BORDE: { color: '#3b82f6', capa: 'BORDES' },
      LOTE: { color: '#eab308', capa: 'LOTES' },
    },
    fileName: 'geodesic.csv',
    rawCSVRows: [],
    columnMapping: {},
    parseOptions: { coordSystem: 'projected', projectedCrs: 'utm', utmZone: '18', hemisphere: 'S' },
    disabledRows: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useApp.mockReturnValue({ state: mockState() })
})

describe('MapView', () => {
  it('renderiza las dos capas base (OSM y satélite)', () => {
    render(<MapView />)
    const urls = screen.getAllByTestId('tile').map((t) => t.getAttribute('data-url'))
    expect(urls.some((u) => u.includes('openstreetmap'))).toBe(true)
    expect(urls.some((u) => u.includes('arcgisonline'))).toBe(true)
  })

  it('genera una capa por tipo de entidad visible (excluye visible:false)', () => {
    render(<MapView />)
    expect(screen.getAllByTestId('circle')).toHaveLength(1) // OCULTO excluido
    expect(screen.getAllByTestId('polyline')).toHaveLength(1)
    expect(screen.getAllByTestId('polygon')).toHaveLength(1)
  })

  it('pinta cada entidad con el color de featureLibrary', () => {
    render(<MapView />)
    expect(screen.getByTestId('circle').getAttribute('data-color')).toBe('#22c55e')
    expect(screen.getByTestId('polyline').getAttribute('data-color')).toBe('#3b82f6')
    expect(screen.getByTestId('polygon').getAttribute('data-color')).toBe('#eab308')
  })
})
