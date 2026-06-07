import Papa from 'papaparse'
import { parseAngle, projectToUTM, resolveZone } from './geoConvert'

const PALETTE = [
  '#60a5fa', '#4ade80', '#f87171', '#facc15',
  '#c084fc', '#fb923c', '#22d3ee', '#f472b6',
  '#a3e635', '#818cf8', '#34d399', '#e879f9',
]

// Sinónimos por campo canónico para auto-detectar el mapeo. Se comparan en minúsculas.
const FIELD_SYNONYMS = {
  nombre: ['nombre', 'name', 'punto', 'pt', 'point', 'id', 'ptname', 'pointname'],
  x:      ['x', 'east', 'easting', 'e', 'lon', 'longitud', 'longitude'],
  y:      ['y', 'north', 'northing', 'n', 'lat', 'latitud', 'latitude'],
  z:      ['z', 'elev', 'elevation', 'elevacion', 'h', 'altura', 'alt'],
  codigo: ['codigo', 'code', 'desc', 'descripcion', 'description', 'cod'],
}

export const REQUIRED_FIELDS = ['nombre', 'x', 'y', 'z', 'codigo']
const NUMERIC_FIELDS = new Set(['x', 'y', 'z'])

export const DEFAULT_PARSE_OPTIONS = {
  delimiter: 'auto',          // 'auto' | ',' | ';' | '\t' | '|'
  decimalSeparator: '.',      // '.' | ','
  hasHeader: true,
  coordSystem: 'projected',   // 'projected' (plano, m) | 'geodetic' (lon/lat WGS84)
  angleFormat: 'decimal',     // 'decimal' | 'dms'  (solo si coordSystem='geodetic')
  utmZone: 'auto',            // 'auto' | '1'..'60'
  hemisphere: 'auto',         // 'auto' | 'N' | 'S'
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsText(file)
  })
}

// Genera nombres de columna únicos y no vacíos a partir de los nombres crudos.
// Los vacíos/espacios pasan a col_N (1-based); los duplicados se desambiguan con
// sufijo _2, _3, … Esto evita que un header vacío rompa la tabla (TanStack exige
// un id no vacío) o choque con el centinela "" ("— sin asignar —") del mapeo.
export function sanitizeHeaders(rawNames, colCount) {
  const used = new Set()
  const out = []
  for (let i = 0; i < colCount; i++) {
    let base = String(rawNames[i] ?? '').trim()
    if (!base) base = `col_${i + 1}`
    let name = base
    let n = 2
    while (used.has(name)) {
      name = `${base}_${n}`
      n += 1
    }
    used.add(name)
    out.push(name)
  }
  return out
}

// Parsea el CSV sin validar columnas requeridas — eso se decide en el paso de mapeo.
// opts: { delimiter, hasHeader }
//
// Parseamos SIEMPRE como arrays (header:false) y saneamos los nombres de columna
// nosotros mismos. Así garantizamos que `headers` nunca contiene nombres vacíos
// ni duplicados, que romperían el render de la tabla o el desplegable de mapeo.
export function parseCSVPreview(csvText, opts = DEFAULT_PARSE_OPTIONS) {
  const { delimiter, hasHeader } = { ...DEFAULT_PARSE_OPTIONS, ...opts }

  const papaOpts = { skipEmptyLines: true }
  if (delimiter && delimiter !== 'auto') {
    papaOpts.delimiter = delimiter
  }

  const result = Papa.parse(csvText.trim(), { ...papaOpts, header: false })
  const allRows = result.data

  // Con cabecera, la primera fila aporta los nombres; sin ella, todos son datos
  // y los nombres salen sintéticos (col_N) vía sanitizeHeaders.
  const nameRow = hasHeader ? allRows[0] ?? [] : []
  const dataRows = hasHeader ? allRows.slice(1) : allRows

  const colCount = Math.max(
    nameRow.length,
    dataRows.reduce((max, row) => Math.max(max, row.length), 0),
  )
  const headers = sanitizeHeaders(nameRow, colCount)
  const rows = dataRows.map((arr) => {
    const obj = {}
    for (let i = 0; i < colCount; i++) obj[headers[i]] = arr[i] ?? ''
    return obj
  })
  return { headers, rows }
}

// Convierte la lista de códigos (devuelta por Python) en featureLibrary con colores asignados cíclicamente.
export function assignColors(codesSummary) {
  return Object.fromEntries(
    codesSummary.map(({ codigo }, i) => [
      codigo,
      { color: PALETTE[i % PALETTE.length], capa: codigo },
    ])
  )
}

// Intenta asociar cada campo canónico con una columna del CSV.
// Devuelve { nombre, x, y, z, codigo } con null donde no se encontró match.
export function autoDetectMapping(headers) {
  const lower = headers.map((h) => h.toLowerCase().trim())
  const used = new Set()
  const mapping = {}

  for (const field of REQUIRED_FIELDS) {
    const syns = FIELD_SYNONYMS[field]
    const idx = lower.findIndex((h, i) => !used.has(i) && syns.includes(h))
    if (idx >= 0) {
      mapping[field] = headers[idx]
      used.add(idx)
    } else {
      mapping[field] = null
    }
  }
  return mapping
}

// Normaliza un valor numérico desde su representación en el CSV al formato canónico
// con punto como decimal. Devuelve string canónico o null si no es un número finito.
export function normalizeNumber(raw, decimalSeparator = '.') {
  if (raw === undefined || raw === null) return null
  const trimmed = String(raw).trim()
  if (trimmed === '') return null

  let candidate = trimmed
  if (decimalSeparator === ',') {
    // Decimal con coma; sin separador de miles soportado por simplicidad.
    if (candidate.includes('.')) return null
    candidate = candidate.replace(',', '.')
  } else if (candidate.includes(',')) {
    // Decimal esperado con punto: si aparece una coma, no es válido.
    return null
  }

  const num = Number(candidate)
  if (!Number.isFinite(num)) return null
  return candidate
}

// Resuelve los valores canónicos de x/y/z de una fila según el sistema de
// coordenadas. En 'projected' normaliza los números tal cual; en 'geodetic'
// interpreta x=lon, y=lat (decimal o DMS) y los proyecta a UTM métrico usando
// `zoneInfo`, dejando z (altura elipsoidal) sin tocar más que normalizar.
// Devuelve { x, y, z } como strings canónicos (punto decimal) y `errors` por campo.
export function resolveCoords(row, mapping, opts, zoneInfo) {
  const { decimalSeparator, coordSystem, angleFormat } = {
    ...DEFAULT_PARSE_OPTIONS,
    ...opts,
  }
  const errors = []
  const rawOf = (field) => {
    const col = mapping[field]
    const raw = col ? row[col] : ''
    return raw === undefined || raw === null ? '' : String(raw)
  }

  if (coordSystem === 'geodetic') {
    const rawX = rawOf('x')
    const rawY = rawOf('y')
    const rawZ = rawOf('z')
    const lon = parseAngle(rawX, angleFormat, decimalSeparator)
    const lat = parseAngle(rawY, angleFormat, decimalSeparator)
    if (lon === null || Math.abs(lon) > 180) {
      errors.push({
        field: 'x',
        value: rawX,
        reason: rawX.trim() === '' ? 'vacío' : 'longitud inválida',
      })
    }
    if (lat === null || Math.abs(lat) > 90) {
      errors.push({
        field: 'y',
        value: rawY,
        reason: rawY.trim() === '' ? 'vacío' : 'latitud inválida',
      })
    }
    const zNorm = normalizeNumber(rawZ, decimalSeparator)
    if (zNorm === null) {
      errors.push({
        field: 'z',
        value: rawZ,
        reason: rawZ.trim() === '' ? 'vacío' : 'no es un número válido',
      })
    }

    let x = ''
    let y = ''
    if (errors.length === 0) {
      if (!zoneInfo) {
        errors.push({ field: 'x', value: rawX, reason: 'zona UTM no determinada' })
      } else {
        const { e, n } = projectToUTM(lon, lat, zoneInfo.zone, zoneInfo.hemisphere)
        // Sin redondear: String() da la representación de doble precisión más
        // corta que round-trippea exacto, preservando toda la precisión.
        x = String(e)
        y = String(n)
      }
    }
    return { x, y, z: zNorm ?? '', errors }
  }

  // Proyectado (plano): cada x/y/z es un número directo.
  const out = {}
  for (const field of ['x', 'y', 'z']) {
    const raw = rawOf(field)
    const normalized = normalizeNumber(raw, decimalSeparator)
    if (normalized === null) {
      errors.push({
        field,
        value: raw,
        reason: raw.trim() === '' ? 'vacío' : 'no es un número válido',
      })
    }
    out[field] = normalized ?? ''
  }
  return { x: out.x, y: out.y, z: out.z, errors }
}

// Recorre las filas y reporta las que no cumplen la validación de campos requeridos.
// Limita la lista detallada a las primeras 50 filas inválidas.
export function validateRows(rows, mapping, opts = DEFAULT_PARSE_OPTIONS, disabledRows = []) {
  const merged = { ...DEFAULT_PARSE_OPTIONS, ...opts }
  const disabled = new Set(disabledRows)
  const zoneInfo =
    merged.coordSystem === 'geodetic'
      ? resolveZone(rows, mapping, merged, disabledRows)
      : null
  const zoneError = merged.coordSystem === 'geodetic' && !zoneInfo

  const invalidRows = []
  let invalidCount = 0
  let totalRows = 0
  const MAX_LISTED = 50

  for (let i = 0; i < rows.length; i++) {
    if (disabled.has(i)) continue // fila desactivada: no entra al proceso
    totalRows += 1
    const row = rows[i]
    const errors = []

    // Campos de texto requeridos: solo se exige que no estén vacíos.
    for (const field of REQUIRED_FIELDS) {
      if (NUMERIC_FIELDS.has(field)) continue
      const col = mapping[field]
      const raw = col ? row[col] : ''
      const value = raw === undefined || raw === null ? '' : String(raw)
      if (value.trim() === '') {
        errors.push({ field, value, reason: 'vacío' })
      }
    }

    // Coordenadas x/y/z (proyectadas o geodésicas).
    errors.push(...resolveCoords(row, mapping, merged, zoneInfo).errors)

    if (errors.length > 0) {
      invalidCount += 1
      if (invalidRows.length < MAX_LISTED) {
        invalidRows.push({ rowIndex: i, errors })
      }
    }
  }

  return { invalidRows, summary: { totalRows, invalidCount, zoneError } }
}

// Genera un CSV con headers canónicos y solo las columnas seleccionadas en el mapping.
// El resultado se manda a Python (csv_parser.parse_csv), que espera ese formato exacto.
// opts.decimalSeparator: si es ',', convierte los valores numéricos a '.' antes de escribir.
export function buildCanonicalCSV(headers, rows, mapping, opts = DEFAULT_PARSE_OPTIONS, disabledRows = []) {
  const merged = { ...DEFAULT_PARSE_OPTIONS, ...opts }
  const disabled = new Set(disabledRows)
  const zoneInfo =
    merged.coordSystem === 'geodetic'
      ? resolveZone(rows, mapping, merged, disabledRows)
      : null
  const canonicalHeader = REQUIRED_FIELDS.join(',')
  const lines = [canonicalHeader]
  for (let r = 0; r < rows.length; r++) {
    if (disabled.has(r)) continue // fila desactivada: no llega a Python
    const row = rows[r]
    const coord = resolveCoords(row, mapping, merged, zoneInfo)
    const valueByField = {
      nombre: mapping.nombre ? String(row[mapping.nombre] ?? '') : '',
      x: coord.x ?? '',
      y: coord.y ?? '',
      z: coord.z ?? '',
      codigo: mapping.codigo ? String(row[mapping.codigo] ?? '') : '',
    }
    const cells = REQUIRED_FIELDS.map((field) => escapeCSV(String(valueByField[field])))
    lines.push(cells.join(','))
  }
  return lines.join('\n')
}

function escapeCSV(value) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
