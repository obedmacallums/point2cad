import proj4 from 'proj4'

// Conversión de coordenadas geodésicas WGS84 (lon, lat) a UTM métrico, para que
// el resto del pipeline (geometría euclidiana en shapes.py, exportadores) opere
// sobre coordenadas planas en metros. La altura elipsoidal NO se toca aquí: se
// pasa tal cual como Z aguas arriba.

// Parsea un valor decimal de grados respetando el separador decimal del CSV.
// Admite signo negativo. Devuelve número o null.
function parseDecimalDeg(raw, decimalSeparator = '.') {
  if (raw === undefined || raw === null) return null
  let s = String(raw).trim()
  if (s === '') return null
  if (decimalSeparator === ',') {
    if (s.includes('.')) return null
    s = s.replace(',', '.')
  } else if (s.includes(',')) {
    return null
  }
  const num = Number(s)
  return Number.isFinite(num) ? num : null
}

// Parsea grados-minutos-segundos en una sola celda. Acepta variantes como
//   33°26'38.5"S   ·   33 26 38.5 S   ·   -33 26 38.5   ·   33d26m38s   ·   S33 26 38
// El signo sale de un sufijo/prefijo de hemisferio (S/W negativos) o de un '-'
// inicial. Minutos y segundos son opcionales. Devuelve grados decimales o null.
function parseDMS(raw, decimalSeparator = '.') {
  if (raw === undefined || raw === null) return null
  let s = String(raw).trim()
  if (s === '') return null
  if (decimalSeparator === ',') s = s.replace(/,/g, '.')

  let sign = 1
  const hemMatch = s.match(/[NSEWnsew]/)
  if (hemMatch) {
    const hem = hemMatch[0].toUpperCase()
    if (hem === 'S' || hem === 'W') sign = -1
  }

  let body = s.replace(/[NSEWnsew]/g, ' ').trim()
  let negative = false
  if (body.startsWith('-')) {
    negative = true
    body = body.slice(1)
  }

  const nums = body.match(/\d+(?:\.\d+)?/g)
  if (!nums || nums.length === 0) return null
  const d = parseFloat(nums[0])
  const m = nums.length > 1 ? parseFloat(nums[1]) : 0
  const sec = nums.length > 2 ? parseFloat(nums[2]) : 0
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(sec)) return null
  if (m >= 60 || sec >= 60) return null

  let dec = Math.abs(d) + m / 60 + sec / 3600
  if (negative) dec = -dec
  return dec * sign
}

// Parsea un ángulo (lon o lat) en el formato indicado. Devuelve grados decimales
// o null si no es interpretable.
export function parseAngle(raw, angleFormat = 'decimal', decimalSeparator = '.') {
  return angleFormat === 'dms'
    ? parseDMS(raw, decimalSeparator)
    : parseDecimalDeg(raw, decimalSeparator)
}

// Zona UTM (1..60) a partir de la longitud en grados.
export function utmZoneFromLon(lon) {
  return Math.floor((lon + 180) / 6) + 1
}

// Cadena proj4 para una zona/hemisferio UTM sobre WGS84.
export function buildUtmProj(zone, hemisphere) {
  const south = hemisphere === 'S' ? ' +south' : ''
  return `+proj=utm +zone=${zone}${south} +datum=WGS84 +units=m +no_defs`
}

// Código EPSG correspondiente (solo informativo para la UI).
export function epsgForZone(zone, hemisphere) {
  return (hemisphere === 'S' ? 32700 : 32600) + zone
}

// Proyecta (lon, lat) en grados decimales a UTM métrico. Devuelve { e, n }.
export function projectToUTM(lon, lat, zone, hemisphere) {
  const [e, n] = proj4('WGS84', buildUtmProj(zone, hemisphere), [lon, lat])
  return { e, n }
}

// Inverso de projectToUTM: de UTM métrico (e, n) a (lon, lat) en grados decimales.
// Se usa al exportar GeoJSON, que exige WGS84 lon/lat (RFC 7946); la geometría en
// memoria está en UTM, así que hay que volver a grados (incluidos los vértices
// sintéticos de círculos/arcos/curvas, que solo existen en UTM).
export function unprojectFromUTM(e, n, zone, hemisphere) {
  const [lon, lat] = proj4(buildUtmProj(zone, hemisphere), 'WGS84', [e, n])
  return { lon, lat }
}

// Devuelve una NUEVA geometría con todas las coordenadas reproyectadas de UTM a
// WGS84 (lon, lat), conservando Z (altura elipsoidal en metros) y los atributos.
// No muta la entrada. Para puntos, x→lon e y→lat de modo que generate_geojson
// (que escribe [x, y, z]) produzca el orden [lon, lat, altura] que pide el RFC.
export function reprojectGeometryToWGS84(geometry, zone, hemisphere) {
  const toLonLat = ([e, n, z]) => {
    const { lon, lat } = unprojectFromUTM(e, n, zone, hemisphere)
    return [lon, lat, z]
  }
  return {
    points: (geometry.points ?? []).map((p) => {
      const { lon, lat } = unprojectFromUTM(p.x, p.y, zone, hemisphere)
      return { ...p, x: lon, y: lat }
    }),
    lines: (geometry.lines ?? []).map((l) => ({
      ...l,
      vertices: l.vertices.map(toLonLat),
    })),
    polylines: (geometry.polylines ?? []).map((pl) => ({
      ...pl,
      vertices: pl.vertices.map(toLonLat),
    })),
  }
}

// Determina la zona/hemisferio UTM a usar. Con utmZone='auto' los deriva del
// primer punto válido del conjunto (saltando filas desactivadas); con valores
// manuales los respeta (hemisphere='auto' se infiere del signo de la latitud de
// referencia). Devuelve { zone, hemisphere, epsg } o null si no hay punto válido
// del que partir.
export function resolveZone(rows, mapping, opts, disabledRows = []) {
  const disabled = new Set(disabledRows)
  const angleFormat = opts.angleFormat ?? 'decimal'
  const decimalSeparator = opts.decimalSeparator ?? '.'

  let refLon = null
  let refLat = null
  for (let i = 0; i < rows.length; i++) {
    if (disabled.has(i)) continue
    const row = rows[i]
    const lon = parseAngle(row[mapping.x], angleFormat, decimalSeparator)
    const lat = parseAngle(row[mapping.y], angleFormat, decimalSeparator)
    if (
      lon !== null &&
      lat !== null &&
      Math.abs(lon) <= 180 &&
      Math.abs(lat) <= 90
    ) {
      refLon = lon
      refLat = lat
      break
    }
  }
  if (refLon === null) return null

  const zone =
    opts.utmZone && opts.utmZone !== 'auto'
      ? parseInt(opts.utmZone, 10)
      : utmZoneFromLon(refLon)
  if (!Number.isInteger(zone) || zone < 1 || zone > 60) return null

  const hemisphere =
    opts.hemisphere && opts.hemisphere !== 'auto'
      ? opts.hemisphere
      : refLat < 0
        ? 'S'
        : 'N'

  return { zone, hemisphere, epsg: epsgForZone(zone, hemisphere) }
}
