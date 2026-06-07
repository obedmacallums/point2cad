import { describe, it, expect } from 'vitest'
import {
  parseAngle,
  utmZoneFromLon,
  epsgForZone,
  projectToUTM,
  resolveZone,
} from './geoConvert'

describe('parseAngle — decimal', () => {
  it('parsea grados decimales con signo', () => {
    expect(parseAngle('-70.62', 'decimal')).toBeCloseTo(-70.62, 6)
    expect(parseAngle('33.44', 'decimal')).toBeCloseTo(33.44, 6)
  })

  it('respeta el separador decimal coma', () => {
    expect(parseAngle('-70,62', 'decimal', ',')).toBeCloseTo(-70.62, 6)
    // con separador punto, una coma es inválida
    expect(parseAngle('-70,62', 'decimal', '.')).toBeNull()
  })

  it('rechaza basura', () => {
    expect(parseAngle('abc', 'decimal')).toBeNull()
    expect(parseAngle('', 'decimal')).toBeNull()
  })
})

describe('parseAngle — DMS', () => {
  it('parsea distintas notaciones a grados decimales', () => {
    expect(parseAngle('33°26\'38.5"S', 'dms')).toBeCloseTo(-(33 + 26 / 60 + 38.5 / 3600), 5)
    expect(parseAngle('33 26 38 S', 'dms')).toBeCloseTo(-(33 + 26 / 60 + 38 / 3600), 5)
    expect(parseAngle('-70 39 0', 'dms')).toBeCloseTo(-(70 + 39 / 60), 5)
    expect(parseAngle('70 39 0 W', 'dms')).toBeCloseTo(-(70 + 39 / 60), 5)
    expect(parseAngle('45', 'dms')).toBeCloseTo(45, 6)
  })

  it('rechaza minutos/segundos fuera de rango y basura', () => {
    expect(parseAngle('33 70 0', 'dms')).toBeNull()
    expect(parseAngle('foo', 'dms')).toBeNull()
  })
})

describe('utmZoneFromLon', () => {
  it('calcula la zona correcta', () => {
    expect(utmZoneFromLon(-70.62)).toBe(19)
    expect(utmZoneFromLon(0)).toBe(31)
    expect(utmZoneFromLon(-69)).toBe(19)
    expect(utmZoneFromLon(3)).toBe(31)
  })
})

describe('epsgForZone', () => {
  it('mapea zona/hemisferio a EPSG', () => {
    expect(epsgForZone(19, 'S')).toBe(32719)
    expect(epsgForZone(19, 'N')).toBe(32619)
  })
})

describe('projectToUTM', () => {
  it('proyecta un punto conocido (Santiago, UTM 19S) con tolerancia métrica', () => {
    const { e, n } = projectToUTM(-70.62, -33.44, 19, 'S')
    expect(e).toBeCloseTo(349414.02, 0) // ~1 m
    expect(n).toBeCloseTo(6298759.56, 0)
  })
})

describe('resolveZone', () => {
  const mapping = { x: 'lon', y: 'lat' }
  const rows = [
    { lon: '-70.62', lat: '-33.44' },
    { lon: '-70.60', lat: '-33.45' },
  ]

  it('auto-detecta zona y hemisferio del primer punto válido', () => {
    const z = resolveZone(rows, mapping, { utmZone: 'auto', hemisphere: 'auto' })
    expect(z).toEqual({ zone: 19, hemisphere: 'S', epsg: 32719 })
  })

  it('respeta override manual de zona/hemisferio', () => {
    const z = resolveZone(rows, mapping, { utmZone: '18', hemisphere: 'N' })
    expect(z).toEqual({ zone: 18, hemisphere: 'N', epsg: 32618 })
  })

  it('salta filas desactivadas para el punto de referencia', () => {
    const z = resolveZone(rows, mapping, { utmZone: 'auto', hemisphere: 'auto' }, [0])
    expect(z.zone).toBe(19)
  })

  it('devuelve null si no hay ningún punto válido', () => {
    const bad = [{ lon: 'x', lat: 'y' }]
    expect(resolveZone(bad, mapping, { utmZone: 'auto', hemisphere: 'auto' })).toBeNull()
  })
})
