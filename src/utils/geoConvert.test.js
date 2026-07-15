import { describe, it, expect } from 'vitest'
import { looksLikeUTM } from './geoConvert'
import {
  parseAngle,
  utmZoneFromLon,
  epsgForZone,
  projectToUTM,
  unprojectFromUTM,
  reprojectGeometryToWGS84,
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

describe('unprojectFromUTM', () => {
  it('es el inverso de projectToUTM (round-trip exacto)', () => {
    const lon = -70.62
    const lat = -33.44
    const { e, n } = projectToUTM(lon, lat, 19, 'S')
    const back = unprojectFromUTM(e, n, 19, 'S')
    expect(back.lon).toBeCloseTo(lon, 6)
    expect(back.lat).toBeCloseTo(lat, 6)
  })
})

describe('reprojectGeometryToWGS84', () => {
  // Un punto y una línea en UTM 19S (zona de Santiago).
  const p = projectToUTM(-70.62, -33.44, 19, 'S')
  const v1 = projectToUTM(-70.60, -33.45, 19, 'S')
  const geometry = {
    points: [{ x: p.e, y: p.n, z: 601.5, codigo: 'EJE', nombre: 'P1' }],
    lines: [
      {
        codigo: 'CERCA',
        vertices: [
          [p.e, p.n, 601.5],
          [v1.e, v1.n, 602.0],
        ],
      },
    ],
    polylines: [],
  }

  it('reproyecta a lon/lat conservando Z y atributos', () => {
    const out = reprojectGeometryToWGS84(geometry, 19, 'S')
    const pt = out.points[0]
    expect(pt.x).toBeCloseTo(-70.62, 5) // lon
    expect(pt.y).toBeCloseTo(-33.44, 5) // lat
    expect(pt.z).toBe(601.5) // altura intacta
    expect(pt.codigo).toBe('EJE')
    expect(pt.nombre).toBe('P1')

    const [lon, lat, z] = out.lines[0].vertices[0]
    expect(lon).toBeCloseTo(-70.62, 5)
    expect(lat).toBeCloseTo(-33.44, 5)
    expect(z).toBe(601.5)
    expect(out.lines[0].codigo).toBe('CERCA')
  })

  it('no muta la geometría de entrada', () => {
    const snapshot = JSON.stringify(geometry)
    reprojectGeometryToWGS84(geometry, 19, 'S')
    expect(JSON.stringify(geometry)).toBe(snapshot)
  })
})

describe('resolveZone (geodésico)', () => {
  const mapping = { x: 'lon', y: 'lat' }
  const geo = { coordSystem: 'geodetic' }
  const rows = [
    { lon: '-70.62', lat: '-33.44' },
    { lon: '-70.60', lat: '-33.45' },
  ]

  it('auto-detecta zona y hemisferio del primer punto válido', () => {
    const z = resolveZone(rows, mapping, { ...geo, utmZone: 'auto', hemisphere: 'auto' })
    expect(z).toEqual({ zone: 19, hemisphere: 'S', epsg: 32719 })
  })

  it('respeta override manual de zona/hemisferio', () => {
    const z = resolveZone(rows, mapping, { ...geo, utmZone: '18', hemisphere: 'N' })
    expect(z).toEqual({ zone: 18, hemisphere: 'N', epsg: 32618 })
  })

  it('salta filas desactivadas para el punto de referencia', () => {
    const z = resolveZone(rows, mapping, { ...geo, utmZone: 'auto', hemisphere: 'auto' }, [0])
    expect(z.zone).toBe(19)
  })

  it('devuelve null si no hay ningún punto válido', () => {
    const bad = [{ lon: 'x', lat: 'y' }]
    expect(resolveZone(bad, mapping, { ...geo, utmZone: 'auto', hemisphere: 'auto' })).toBeNull()
  })
})

describe('resolveZone (plano con CRS declarado)', () => {
  const mapping = { x: 'x', y: 'y' }
  const rows = [{ x: '350000', y: '6250000' }]

  it('resuelve zona/hemisferio declarados por el usuario', () => {
    const z = resolveZone(rows, mapping, {
      coordSystem: 'projected',
      projectedCrs: 'utm',
      utmZone: '18',
      hemisphere: 'S',
    })
    expect(z).toEqual({ zone: 18, hemisphere: 'S', epsg: 32718 })
  })

  it('sin declarar CRS (local) devuelve null', () => {
    const z = resolveZone(rows, mapping, {
      coordSystem: 'projected',
      projectedCrs: 'local',
      utmZone: '18',
      hemisphere: 'S',
    })
    expect(z).toBeNull()
  })

  it("con zona u hemisferio en 'auto' no hay CRS (no se puede inferir de planas)", () => {
    const base = { coordSystem: 'projected', projectedCrs: 'utm' }
    expect(
      resolveZone(rows, mapping, { ...base, utmZone: 'auto', hemisphere: 'S' }),
    ).toBeNull()
    expect(
      resolveZone(rows, mapping, { ...base, utmZone: '18', hemisphere: 'auto' }),
    ).toBeNull()
  })
})

describe('looksLikeUTM', () => {
  const mapping = { x: 'x', y: 'y' }
  const opts = { decimalSeparator: '.' }

  it('true con eastings/northings en rango UTM', () => {
    const rows = [
      { x: '350000.5', y: '6250000.2' },
      { x: '351000', y: '6251000' },
    ]
    expect(looksLikeUTM(rows, mapping, opts)).toBe(true)
  })

  it('false con coordenadas de grilla local (base 1000/2000)', () => {
    const rows = [{ x: '1000', y: '2000' }]
    expect(looksLikeUTM(rows, mapping, opts)).toBe(false)
  })

  it('false si el northing excede el límite del sistema', () => {
    const rows = [{ x: '350000', y: '12000000' }]
    expect(looksLikeUTM(rows, mapping, opts)).toBe(false)
  })

  it('null sin ninguna fila numérica', () => {
    const rows = [{ x: 'abc', y: '' }]
    expect(looksLikeUTM(rows, mapping, opts)).toBeNull()
  })

  it('ignora filas desactivadas', () => {
    const rows = [
      { x: '1000', y: '2000' },
      { x: '350000', y: '6250000' },
    ]
    expect(looksLikeUTM(rows, mapping, opts, [0])).toBe(true)
  })

  it('respeta el separador decimal coma', () => {
    const rows = [{ x: '350000,5', y: '6250000,2' }]
    expect(looksLikeUTM(rows, mapping, { decimalSeparator: ',' })).toBe(true)
  })
})
