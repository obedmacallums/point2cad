import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import MapView from './MapView'
import { useApp } from '../../context/AppContext'
import { __mapMock } from 'react-leaflet'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))

// react-leaflet mockeado: cada componente renderiza un marcador simple que
// expone el color por data-attr, para poder contar capas por tipo.
// mapMock: instancia compartida devuelta por useMap para poder inspeccionar,
// en los tests, qué eventos se suscriben/desuscriben (on/off) en MapController.
vi.mock('react-leaflet', () => {
  const Base = ({ children }) => <div>{children}</div>
  const LayersControl = ({ children }) => <div>{children}</div>
  LayersControl.BaseLayer = ({ name, children }) => (
    <div data-testid="baselayer" data-name={name}>{children}</div>
  )
  const LayerGroup = ({ children }) => <div data-testid="layergroup">{children}</div>
  const mapMock = { invalidateSize: vi.fn(), fitBounds: vi.fn(), on: vi.fn(), off: vi.fn() }
  return {
    MapContainer: ({ children, maxZoom }) => (
      <div data-testid="map" data-max-zoom={maxZoom}>{children}</div>
    ),
    TileLayer: ({ url, crossOrigin, maxZoom, maxNativeZoom }) => (
      <div
        data-testid="tile"
        data-url={url}
        data-cross={crossOrigin}
        data-max-zoom={maxZoom}
        data-max-native-zoom={maxNativeZoom}
      />
    ),
    LayersControl,
    LayerGroup,
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
    useMap: () => mapMock,
    __mapMock: mapMock,
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
  it('renderiza las tres capas base (OSM, satélite e híbrido)', () => {
    render(<MapView />)
    const names = screen.getAllByTestId('baselayer').map((el) => el.getAttribute('data-name'))
    expect(names).toEqual(['OpenStreetMap', 'Satélite (Esri)', 'Híbrido'])
  })

  it('todas las capas de tiles llevan crossOrigin="anonymous" (para pasar COEP require-corp)', () => {
    render(<MapView />)
    const crossValues = screen.getAllByTestId('tile').map((t) => t.getAttribute('data-cross'))
    expect(crossValues).toEqual(['anonymous', 'anonymous', 'anonymous', 'anonymous'])
  })

  it('la capa "Híbrido" combina imagen satelital y etiquetas (dos TileLayer con URLs distintas)', () => {
    render(<MapView />)
    const hibrido = screen
      .getAllByTestId('baselayer')
      .find((el) => el.getAttribute('data-name') === 'Híbrido')
    const urls = within(hibrido).getAllByTestId('tile').map((t) => t.getAttribute('data-url'))
    expect(urls).toHaveLength(2)
    expect(urls[0]).toContain('World_Imagery')
    expect(urls[1]).toContain('World_Boundaries_and_Places')
  })

  it('el mapa y las capas de tiles permiten zoom hasta 21 (over-zoom con maxNativeZoom 19)', () => {
    render(<MapView />)
    expect(screen.getByTestId('map').getAttribute('data-max-zoom')).toBe('21')

    const tiles = screen.getAllByTestId('tile')
    expect(tiles).toHaveLength(4)
    tiles.forEach((tile) => {
      expect(tile.getAttribute('data-max-zoom')).toBe('21')
      expect(tile.getAttribute('data-max-native-zoom')).toBe('19')
    })
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

  it('suscribe tanto tileerror como tileload en el mapa (para poder limpiar el banner)', () => {
    render(<MapView />)
    const events = __mapMock.on.mock.calls.map(([eventName]) => eventName)
    expect(events).toEqual(expect.arrayContaining(['tileerror', 'tileload']))
  })

  it('el botón "Ajustar vista" está habilitado y llama a fitBounds al hacer click', () => {
    render(<MapView />)
    const btn = screen.getByRole('button', { name: 'Ajustar vista' })
    expect(btn).not.toBeDisabled()

    // MapController ya llama a fitBounds una vez al montar (efecto sobre
    // datasetKey). Se limpia aquí para aislar la llamada disparada por el
    // click del botón, que es lo que este test verifica.
    __mapMock.fitBounds.mockClear()

    fireEvent.click(btn)

    expect(__mapMock.fitBounds).toHaveBeenCalledTimes(1)
    const [bounds, options] = __mapMock.fitBounds.mock.calls[0]
    expect(bounds).toHaveLength(2) // [[minLat, minLng], [maxLat, maxLng]]
    expect(bounds[0]).toHaveLength(2)
    expect(bounds[1]).toHaveLength(2)
    expect(options).toEqual({ padding: [24, 24] })
  })

  it('el botón "Ajustar vista" está deshabilitado cuando no hay geometría visible', () => {
    const state = mockState()
    Object.keys(state.featureLibrary).forEach((codigo) => {
      state.featureLibrary[codigo] = { ...state.featureLibrary[codigo], visible: false }
    })
    useApp.mockReturnValue({ state })

    render(<MapView />)
    const btn = screen.getByRole('button', { name: 'Ajustar vista' })
    expect(btn).toBeDisabled()
  })
})
