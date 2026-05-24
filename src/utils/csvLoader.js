import Papa from 'papaparse'

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

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsText(file)
  })
}

// Parsea el CSV sin validar columnas requeridas — eso se decide en el paso de mapeo.
export function parseCSVPreview(csvText) {
  const result = Papa.parse(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })
  return { headers: result.meta.fields ?? [], rows: result.data }
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

// Genera un CSV con headers canónicos y solo las columnas seleccionadas en el mapping.
// El resultado se manda a Python (csv_parser.parse_csv), que espera ese formato exacto.
export function buildCanonicalCSV(headers, rows, mapping) {
  const canonicalHeader = REQUIRED_FIELDS.join(',')
  const lines = [canonicalHeader]
  for (const row of rows) {
    const cells = REQUIRED_FIELDS.map((field) => {
      const col = mapping[field]
      const raw = col ? row[col] ?? '' : ''
      return escapeCSV(String(raw))
    })
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
