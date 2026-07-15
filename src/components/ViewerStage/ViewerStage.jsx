import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { resolveZone } from '../../utils/geoConvert'
import Viewer3D from '../Viewer3D/Viewer3D'
import MapView from '../MapView/MapView'

const CRS_DISABLED_REASON = 'Requiere CRS — decláralo en Importar CSV'

export default function ViewerStage() {
  const { state } = useApp()
  const [viewMode, setViewMode] = useState('3d')
  // El mapa se monta perezosamente la primera vez que se entra al modo mapa y a
  // partir de ahí queda montado (oculto con `hidden`): así Leaflet no re-encuadra
  // ni recarga tiles al alternar, y la cámara 3D tampoco se resetea.
  const [mapMounted, setMapMounted] = useState(false)

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
  const mapAvailable = zoneInfo !== null

  // Si el CRS deja de ser resoluble estando en el mapa, volvemos a 3D (mismo
  // patrón que el ExportPanel al perder un formato WGS84).
  useEffect(() => {
    if (viewMode === 'map' && !mapAvailable) setViewMode('3d')
  }, [viewMode, mapAvailable])

  function showMap() {
    if (!mapAvailable) return
    setMapMounted(true)
    setViewMode('map')
  }

  const segBtn = (activeSeg) =>
    `px-3 py-1.5 transition-colors ${
      viewMode === activeSeg
        ? 'bg-emerald-600 text-white'
        : 'text-gray-300 hover:text-white'
    }`

  return (
    <div className="relative h-full w-full">
      <div className="absolute top-2 left-1/2 z-20 flex -translate-x-1/2 overflow-hidden rounded-md border border-gray-700 bg-gray-900/90 text-sm shadow">
        <button type="button" onClick={() => setViewMode('3d')} className={segBtn('3d')}>
          3D
        </button>
        <button
          type="button"
          onClick={showMap}
          disabled={!mapAvailable}
          title={mapAvailable ? undefined : CRS_DISABLED_REASON}
          className={`${segBtn('map')} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          Mapa
        </button>
      </div>

      <div className={`h-full w-full ${viewMode === '3d' ? '' : 'hidden'}`}>
        <Viewer3D />
      </div>
      {mapMounted && (
        <div className={`h-full w-full ${viewMode === 'map' ? '' : 'hidden'}`}>
          <MapView active={viewMode === 'map'} />
        </div>
      )}
    </div>
  )
}
