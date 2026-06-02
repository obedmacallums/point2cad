import { useEffect, useRef } from 'react'
import { usePyodide } from '../context/PyodideContext'
import { useApp } from '../context/AppContext'

// Precarga en segundo plano (no bloqueante) el stack pesado de GeoPackage
// (geopandas + fiona + GDAL) apenas el usuario empieza a importar/mapear un CSV,
// para que ya esté listo cuando llegue a exportar. Se dispara una sola vez.
export function useGeopackagePreload() {
  const { ensurePackages } = usePyodide()
  const { state } = useApp()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    if (state.appMode === 'idle') return
    started.current = true
    ensurePackages(['geopandas', 'fiona']).catch(() => {
      // Silencioso: si falla, exportGeometry reintentará y mostrará el error real.
    })
  }, [state.appMode, ensurePackages])
}
