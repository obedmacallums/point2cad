import { describe, it, expect } from 'vitest'
import {
  sanitizeHeaders,
  parseCSVPreview,
  buildCanonicalCSV,
  validateRows,
} from './csvLoader'

describe('sanitizeHeaders', () => {
  it('reemplaza nombres vacíos/espacios por col_N (1-based)', () => {
    expect(sanitizeHeaders(['', '  ', 'x'], 3)).toEqual(['col_1', 'col_2', 'x'])
  })

  it('desambigua duplicados con sufijo _N', () => {
    expect(sanitizeHeaders(['x', 'x', 'y', 'x'], 4)).toEqual([
      'x',
      'x_2',
      'y',
      'x_3',
    ])
  })

  it('rellena hasta colCount aunque falten nombres', () => {
    expect(sanitizeHeaders(['a'], 3)).toEqual(['a', 'col_2', 'col_3'])
  })
})

describe('parseCSVPreview', () => {
  // El CSV del bug: sin cabecera real, primera fila con coma final (campo vacío).
  const bugCSV = [
    'Pt30,-33.44,-70.62,601.5,',
    'Pt29,-33.44,-70.62,601.5,reja',
    'Pt28,-33.44,-70.62,601.5,eje',
  ].join('\n')

  it('con hasHeader:true sanea el header vacío en vez de dejar ""', () => {
    const { headers, rows } = parseCSVPreview(bugCSV, { hasHeader: true })
    expect(headers).toHaveLength(5)
    expect(headers).not.toContain('') // <- el "" que rompía TanStack
    expect(headers[4]).toBe('col_5')
    // La primera fila de datos es Pt29 (Pt30 se consumió como cabecera).
    expect(rows).toHaveLength(2)
    expect(rows[0][headers[0]]).toBe('Pt29')
    expect(rows[0][headers[4]]).toBe('reja')
  })

  it('con hasHeader:false genera col_1..col_N y conserva todas las filas', () => {
    const { headers, rows } = parseCSVPreview(bugCSV, { hasHeader: false })
    expect(headers).toEqual(['col_1', 'col_2', 'col_3', 'col_4', 'col_5'])
    expect(rows).toHaveLength(3)
    expect(rows[0].col_1).toBe('Pt30')
  })

  it('desambigua cabeceras duplicadas', () => {
    const csv = 'x,x,y\n1,2,3'
    const { headers } = parseCSVPreview(csv, { hasHeader: true })
    expect(headers).toEqual(['x', 'x_2', 'y'])
  })
})

describe('buildCanonicalCSV con disabledRows', () => {
  const headers = ['n', 'x', 'y', 'z', 'c']
  const mapping = { nombre: 'n', x: 'x', y: 'y', z: 'z', codigo: 'c' }
  const rows = [
    { n: 'P1', x: '1', y: '2', z: '3', c: 'A' },
    { n: 'P2', x: '4', y: '5', z: '6', c: 'B' },
    { n: 'P3', x: '7', y: '8', z: '9', c: 'C' },
  ]

  it('omite las filas desactivadas', () => {
    const csv = buildCanonicalCSV(headers, rows, mapping, undefined, [1])
    const lines = csv.split('\n')
    expect(lines[0]).toBe('nombre,x,y,z,codigo')
    expect(csv).toContain('P1')
    expect(csv).not.toContain('P2')
    expect(csv).toContain('P3')
  })

  it('sin disabledRows incluye todas (compatibilidad)', () => {
    const csv = buildCanonicalCSV(headers, rows, mapping)
    expect(csv).toContain('P2')
  })
})

describe('validateRows con disabledRows', () => {
  const headers = ['n', 'x', 'y', 'z', 'c']
  const mapping = { nombre: 'n', x: 'x', y: 'y', z: 'z', codigo: 'c' }
  const rows = [
    { n: 'P1', x: '1', y: '2', z: '3', c: 'A' },
    { n: 'P2', x: 'no-num', y: '5', z: '6', c: 'B' }, // inválida (x no numérico)
  ]

  it('una fila inválida desactivada no se cuenta', () => {
    const { summary } = validateRows(rows, mapping, undefined, [1])
    expect(summary.invalidCount).toBe(0)
    expect(summary.totalRows).toBe(1) // solo cuenta las activas
  })

  it('sin desactivar, detecta la fila inválida', () => {
    const { summary } = validateRows(rows, mapping)
    expect(summary.invalidCount).toBe(1)
    expect(summary.totalRows).toBe(2)
  })
})

describe('coordenadas geodésicas', () => {
  const mapping = { nombre: 'n', x: 'lon', y: 'lat', z: 'h', codigo: 'c' }
  const geodeticOpts = {
    coordSystem: 'geodetic',
    angleFormat: 'decimal',
    utmZone: 'auto',
    hemisphere: 'auto',
  }
  const rows = [
    { n: 'P1', lon: '-70.62', lat: '-33.44', h: '601.5', c: 'EJE' },
    { n: 'P2', lon: '-70.60', lat: '-33.45', h: '602.0', c: 'EJE' },
  ]

  it('buildCanonicalCSV proyecta lon/lat a UTM y conserva la altura', () => {
    const csv = buildCanonicalCSV(['n', 'lon', 'lat', 'h', 'c'], rows, mapping, geodeticOpts)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('nombre,x,y,z,codigo')
    const [nombre, x, y, z, codigo] = lines[1].split(',')
    expect(nombre).toBe('P1')
    // E ~349414, N ~6298760 (UTM 19S), altura passthrough
    expect(Number(x)).toBeCloseTo(349414.02, 0)
    expect(Number(y)).toBeCloseTo(6298759.56, 0)
    expect(z).toBe('601.5')
    expect(codigo).toBe('EJE')
  })

  it('acepta entrada en DMS', () => {
    const dmsRows = [{ n: 'P1', lon: '70 37 12 W', lat: '33 26 24 S', h: '601.5', c: 'EJE' }]
    const csv = buildCanonicalCSV(
      ['n', 'lon', 'lat', 'h', 'c'],
      dmsRows,
      mapping,
      { ...geodeticOpts, angleFormat: 'dms' },
    )
    const cols = csv.split('\n')[1].split(',')
    // 70°37'12"W = -70.62 ; 33°26'24"S = -33.44 → mismas E/N que el caso decimal
    expect(Number(cols[1])).toBeCloseTo(349414.02, 0)
    expect(Number(cols[2])).toBeCloseTo(6298759.56, 0)
  })

  it('validateRows marca latitud fuera de rango', () => {
    const badRows = [{ n: 'P1', lon: '-70.62', lat: '120', h: '5', c: 'A' }]
    const { summary } = validateRows(badRows, mapping, geodeticOpts)
    expect(summary.invalidCount).toBe(1)
  })

  it('validateRows señala cuando no se puede determinar la zona', () => {
    const badRows = [{ n: 'P1', lon: 'foo', lat: 'bar', h: '5', c: 'A' }]
    const { summary } = validateRows(badRows, mapping, geodeticOpts)
    expect(summary.zoneError).toBe(true)
    expect(summary.invalidCount).toBe(1)
  })

  it('en modo proyectado (default) no transforma', () => {
    const projRows = [{ n: 'P1', lon: '500', lat: '600', h: '7', c: 'A' }]
    const csv = buildCanonicalCSV(['n', 'lon', 'lat', 'h', 'c'], projRows, mapping)
    const cols = csv.split('\n')[1].split(',')
    expect(cols[1]).toBe('500')
    expect(cols[2]).toBe('600')
  })
})
