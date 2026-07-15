import { describe, it, expect } from 'vitest'
import { buildMapLayers } from './mapLayers'

// Zona 18 S (Chile). Coordenadas UTM plausibles cerca de Santiago.
const zoneInfo = { zone: 18, hemisphere: 'S', epsg: 32718 }

const geometry = {
  points: [
    { x: 345000, y: 6300000, z: 500, codigo: 'ARB', nombre: 'P1' },
    { x: 345010, y: 6300010, z: 501, codigo: 'OCULTO', nombre: 'P2' },
  ],
  lines: [
    { codigo: 'BORDE', vertices: [[345000, 6300000, 0], [345020, 6300020, 0]] },
  ],
  polylines: [
    { codigo: 'LOTE', vertices: [[345000, 6300000, 0], [345020, 6300000, 0], [345020, 6300020, 0]] },
  ],
}

const featureLibrary = {
  ARB: { color: '#22c55e', capa: 'ARBOLES', visible: true },
  OCULTO: { color: '#ef4444', capa: 'OCULTO', visible: false },
  BORDE: { color: '#3b82f6', capa: 'BORDES' },
  LOTE: { color: '#eab308', capa: 'LOTES' },
}

describe('buildMapLayers', () => {
  it('sin zoneInfo devuelve capas vacías y bounds null', () => {
    const r = buildMapLayers(geometry, featureLibrary, null)
    expect(r).toEqual({ points: [], lines: [], polygons: [], bounds: null })
  })

  it('genera una capa por tipo de entidad visible', () => {
    const r = buildMapLayers(geometry, featureLibrary, zoneInfo)
    expect(r.points).toHaveLength(1) // P2 excluido por visible:false
    expect(r.lines).toHaveLength(1)
    expect(r.polygons).toHaveLength(1)
  })

  it('excluye los códigos con visible === false', () => {
    const r = buildMapLayers(geometry, featureLibrary, zoneInfo)
    expect(r.points.map((p) => p.popup.codigo)).toEqual(['ARB'])
  })

  it('toma el color de featureLibrary', () => {
    const r = buildMapLayers(geometry, featureLibrary, zoneInfo)
    expect(r.points[0].color).toBe('#22c55e')
    expect(r.lines[0].color).toBe('#3b82f6')
    expect(r.polygons[0].color).toBe('#eab308')
  })

  it('usa un color de reserva cuando el código no está en la biblioteca', () => {
    const r = buildMapLayers(
      { points: [{ x: 345000, y: 6300000, z: 0, codigo: 'SIN', nombre: '' }], lines: [], polylines: [] },
      {},
      zoneInfo,
    )
    expect(r.points[0].color).toBe('#9ca3af')
  })

  it('el popup de punto conserva las coordenadas UTM originales', () => {
    const r = buildMapLayers(geometry, featureLibrary, zoneInfo)
    expect(r.points[0].popup).toMatchObject({
      type: 'point', nombre: 'P1', codigo: 'ARB', capa: 'ARBOLES',
      x: 345000, y: 6300000, z: 500,
    })
  })

  it('el popup de línea/polígono lleva el conteo de vértices', () => {
    const r = buildMapLayers(geometry, featureLibrary, zoneInfo)
    expect(r.lines[0].popup).toMatchObject({ type: 'line', codigo: 'BORDE', capa: 'BORDES', vertices: 2 })
    expect(r.polygons[0].popup).toMatchObject({ type: 'polygon', codigo: 'LOTE', capa: 'LOTES', vertices: 3 })
  })

  it('latlng de punto es [lat, lng] reproyectado al hemisferio sur', () => {
    const r = buildMapLayers(geometry, featureLibrary, zoneInfo)
    const [lat, lng] = r.points[0].latlng
    expect(lat).toBeLessThan(0)        // hemisferio sur
    expect(lat).toBeGreaterThan(-90)
    expect(lng).toBeGreaterThan(-180)
    expect(lng).toBeLessThan(0)        // longitud oeste
  })

  it('bounds cubre todas las geometrías visibles', () => {
    const r = buildMapLayers(geometry, featureLibrary, zoneInfo)
    expect(r.bounds).not.toBeNull()
    const [[minLat, minLng], [maxLat, maxLng]] = r.bounds
    expect(minLat).toBeLessThanOrEqual(maxLat)
    expect(minLng).toBeLessThanOrEqual(maxLng)
  })
})
