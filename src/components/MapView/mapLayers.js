import { reprojectGeometryToWGS84 } from '../../utils/geoConvert'

// Color de reserva (gray-400) cuando un código no está en la biblioteca; evita
// marcadores invisibles ante datos inconsistentes.
const FALLBACK_COLOR = '#9ca3af'

const isVisible = (featureLibrary, codigo) =>
  featureLibrary[codigo]?.visible !== false

const colorFor = (featureLibrary, codigo) =>
  featureLibrary[codigo]?.color ?? FALLBACK_COLOR

const capaFor = (featureLibrary, codigo) =>
  featureLibrary[codigo]?.capa ?? codigo

// Transforma la geometría en memoria (UTM) en descriptores listos para Leaflet.
// Reproyecta a WGS84 con la misma función que el export, filtra por visibilidad
// y conserva las coordenadas UTM originales para los popups. Devuelve
// { points, lines, polygons, bounds } con latlng en orden [lat, lng]. bounds es
// [[minLat, minLng], [maxLat, maxLng]] o null si no hay geometría visible.
export function buildMapLayers(geometry, featureLibrary = {}, zoneInfo) {
  if (!zoneInfo) return { points: [], lines: [], polygons: [], bounds: null }

  const visP = (geometry.points ?? []).filter((p) => isVisible(featureLibrary, p.codigo))
  const visL = (geometry.lines ?? []).filter((l) => isVisible(featureLibrary, l.codigo))
  const visPl = (geometry.polylines ?? []).filter((pl) => isVisible(featureLibrary, pl.codigo))

  // reprojectGeometryToWGS84 devuelve puntos con x=lng, y=lat y vértices [lng, lat, z].
  const wgs = reprojectGeometryToWGS84(
    { points: visP, lines: visL, polylines: visPl },
    zoneInfo.zone,
    zoneInfo.hemisphere,
  )

  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity
  const track = (lat, lng) => {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
  }

  const points = wgs.points.map((rp, i) => {
    const orig = visP[i]
    track(rp.y, rp.x)
    return {
      key: `p${i}`,
      latlng: [rp.y, rp.x],
      color: colorFor(featureLibrary, orig.codigo),
      popup: {
        type: 'point',
        nombre: orig.nombre ?? '',
        codigo: orig.codigo,
        capa: capaFor(featureLibrary, orig.codigo),
        x: orig.x, y: orig.y, z: orig.z,
      },
    }
  })

  const toLatLngs = (verts) =>
    verts.map(([lng, lat]) => {
      track(lat, lng)
      return [lat, lng]
    })

  const lineDescriptor = (prefix, type) => (rl, i, orig) => ({
    key: `${prefix}${i}`,
    latlngs: toLatLngs(rl.vertices),
    color: colorFor(featureLibrary, orig.codigo),
    popup: {
      type,
      codigo: orig.codigo,
      capa: capaFor(featureLibrary, orig.codigo),
      vertices: orig.vertices.length,
    },
  })

  const makeLine = lineDescriptor('l', 'line')
  const makePolygon = lineDescriptor('pg', 'polygon')

  const lines = wgs.lines.map((rl, i) => makeLine(rl, i, visL[i]))
  const polygons = wgs.polylines.map((rpl, i) => makePolygon(rpl, i, visPl[i]))

  const bounds = Number.isFinite(minLat)
    ? [[minLat, minLng], [maxLat, maxLng]]
    : null

  return { points, lines, polygons, bounds }
}
