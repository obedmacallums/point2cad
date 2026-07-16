import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  LayersControl,
  LayerGroup,
  CircleMarker,
  Polyline,
  Polygon,
  Popup,
  useMap,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useApp } from '../../context/AppContext'
import { resolveZone } from '../../utils/geoConvert'
import { buildMapLayers } from './mapLayers'
import MapToolbar from './MapToolbar'

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTR = '© OpenStreetMap contributors'
const SAT_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const SAT_ATTR = 'Esri, Maxar, Earthstar Geographics'
const LABELS_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'

// Controla el mapa desde dentro de MapContainer (donde useMap tiene contexto):
// corrige el tamaño al hacerse visible, encaja el dataset solo cuando cambia, y
// escucha errores de tiles para avisar sin bloquear.
function MapController({ bounds, datasetKey, active, onTileError, onTileLoad }) {
  const map = useMap()

  // Leaflet calcula mal el tamaño si se montó oculto; al pasar a visible lo
  // recalculamos.
  useEffect(() => {
    if (active) map.invalidateSize()
  }, [active, map])

  // fitBounds solo cuando cambia el dataset, no en cada alternancia 3D⇄Mapa.
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [24, 24] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetKey])

  // El banner de "sin conexión" se activa con el primer tileerror y se limpia
  // en cuanto un tile carga con éxito: así no queda fijo toda la sesión tras
  // un único fallo transitorio (mapa persistente entre alternancias 3D⇄Mapa).
  useEffect(() => {
    map.on('tileerror', onTileError)
    map.on('tileload', onTileLoad)
    return () => {
      map.off('tileerror', onTileError)
      map.off('tileload', onTileLoad)
    }
  }, [map, onTileError, onTileLoad])

  return null
}

function PointPopupBody({ popup }) {
  return (
    <div className="text-xs leading-5">
      {popup.nombre ? <div><strong>{popup.nombre}</strong></div> : null}
      <div>Código: {popup.codigo}</div>
      <div>Capa: {popup.capa}</div>
      <div>X: {popup.x} · Y: {popup.y} · Z: {popup.z}</div>
    </div>
  )
}

function FeaturePopupBody({ popup }) {
  return (
    <div className="text-xs leading-5">
      <div>Código: {popup.codigo}</div>
      <div>Capa: {popup.capa}</div>
      <div>Vértices: {popup.vertices}</div>
    </div>
  )
}

export default function MapView({ active = true }) {
  const { state } = useApp()
  const [tileError, setTileError] = useState(false)
  const handleTileError = useCallback(() => setTileError(true), [])
  const handleTileLoad = useCallback(() => setTileError(false), [])

  const zoneInfo = useMemo(
    () =>
      resolveZone(
        state.rawCSVRows,
        state.columnMapping,
        state.parseOptions,
        state.disabledRows,
      ),
    [state.rawCSVRows, state.columnMapping, state.parseOptions, state.disabledRows],
  )

  const layers = useMemo(
    () =>
      buildMapLayers(
        { points: state.points, lines: state.lines, polylines: state.polylines },
        state.featureLibrary,
        zoneInfo,
      ),
    [state.points, state.lines, state.polylines, state.featureLibrary, zoneInfo],
  )

  // Cambia cuando cambia el dataset → redispara fitBounds.
  const datasetKey = `${state.fileName ?? ''}:${state.points.length}:${state.lines.length}:${state.polylines.length}`

  const center = layers.bounds
    ? [
        (layers.bounds[0][0] + layers.bounds[1][0]) / 2,
        (layers.bounds[0][1] + layers.bounds[1][1]) / 2,
      ]
    : [0, 0]

  // relative z-0 + isolate: crea un stacking context propio para que los panes
  // internos de Leaflet (z-index 200–700) no tapen el drawer (z-50) ni modales.
  return (
    <div className="relative z-0 isolate h-full w-full bg-gray-950">
      {tileError && (
        <div className="absolute top-2 left-1/2 z-[500] -translate-x-1/2 rounded bg-amber-900/90 px-3 py-1.5 text-xs text-amber-100 shadow">
          Sin conexión: no se puede cargar el mapa base
        </div>
      )}
      <MapContainer center={center} zoom={13} maxZoom={21} preferCanvas className="h-full w-full">
        {/* crossOrigin="anonymous": el dev server fija COEP require-corp (vite.config.js)
            y Leaflet 1.9 no pide los tiles con atributo crossorigin por defecto. Ambos
            hosts responden con Access-Control-Allow-Origin: *, así que un fetch en modo
            CORS satisface el COEP y evita que el navegador bloquee los tiles.
            maxNativeZoom distinto por proveedor: OSM tiene cobertura global consistente
            hasta zoom 19. Esri World_Imagery NO — su resolución real varía por región, y
            pedir tiles nativos más allá de lo que esa zona tiene capturado hace que Esri
            responda con un tile "Imagery not available" (200 OK, no un error detectable
            por Leaflet). Por eso Satélite e Híbrido usan maxNativeZoom={18} (el nivel que
            ya funcionaba de forma fiable antes de subir maxZoom), mientras que
            maxZoom={21} en MapContainer y en cada capa permite seguir dando over-zoom
            (ampliar el último tile real) por encima de la resolución nativa de cada una. */}
        <LayersControl position="bottomright">
          <LayersControl.BaseLayer checked name="OpenStreetMap">
            <TileLayer
              url={OSM_URL}
              attribution={OSM_ATTR}
              crossOrigin="anonymous"
              maxZoom={21}
              maxNativeZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satélite (Esri)">
            <TileLayer
              url={SAT_URL}
              attribution={SAT_ATTR}
              crossOrigin="anonymous"
              maxZoom={21}
              maxNativeZoom={18}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Híbrido">
            <LayerGroup>
              <TileLayer
                url={SAT_URL}
                attribution={SAT_ATTR}
                crossOrigin="anonymous"
                maxZoom={21}
                maxNativeZoom={18}
              />
              <TileLayer
                url={LABELS_URL}
                attribution={SAT_ATTR}
                crossOrigin="anonymous"
                maxZoom={21}
                maxNativeZoom={18}
              />
            </LayerGroup>
          </LayersControl.BaseLayer>
        </LayersControl>

        <MapToolbar bounds={layers.bounds} />

        {layers.points.map((p) => (
          <CircleMarker
            key={p.key}
            center={p.latlng}
            radius={4}
            pathOptions={{ color: p.color, fillColor: p.color, fillOpacity: 0.9, weight: 1 }}
          >
            <Popup>
              <PointPopupBody popup={p.popup} />
            </Popup>
          </CircleMarker>
        ))}

        {layers.lines.map((l) => (
          <Polyline key={l.key} positions={l.latlngs} pathOptions={{ color: l.color, weight: 2 }}>
            <Popup>
              <FeaturePopupBody popup={l.popup} />
            </Popup>
          </Polyline>
        ))}

        {layers.polygons.map((pg) => (
          <Polygon
            key={pg.key}
            positions={pg.latlngs}
            pathOptions={{ color: pg.color, weight: 2, fillColor: pg.color, fillOpacity: 0.2 }}
          >
            <Popup>
              <FeaturePopupBody popup={pg.popup} />
            </Popup>
          </Polygon>
        ))}

        <MapController
          bounds={layers.bounds}
          datasetKey={datasetKey}
          active={active}
          onTileError={handleTileError}
          onTileLoad={handleTileLoad}
        />
      </MapContainer>
    </div>
  )
}
