import { useState } from 'react'
import { useApp } from './context/AppContext'
import FileUpload from './components/FileUpload/FileUpload'
import ViewerStage from './components/ViewerStage/ViewerStage'
import CSVPreview from './components/CSVPreview/CSVPreview'
import ResultsPanel from './components/ResultsPanel/ResultsPanel'
import FeatureLibrary from './components/FeatureLibrary/FeatureLibrary'
import ExportPanel from './components/ExportPanel/ExportPanel'
import IdleDropZone from './components/IdleDropZone/IdleDropZone'
import StageStepper from './components/StageStepper/StageStepper'
import ResumeSessionModal from './components/ResumeSessionModal/ResumeSessionModal'
import UserMenu from './components/UserMenu/UserMenu'
import { useSessionRehydration } from './hooks/useSessionRehydration'
import { useGeopackagePreload } from './hooks/useGeopackagePreload'
import { loadSession, clearSession } from './utils/sessionStorage'

function MainArea() {
  const { state } = useApp()

  switch (state.appMode) {
    case 'preview':
    case 'detecting':
    case 'codes_ready':
    case 'processing':
      return <CSVPreview />

    case 'ready':
      return <ResultsPanel />

    case 'viewer':
      return <ViewerStage />

    default:
      return <IdleDropZone />
  }
}

function RehydratingOverlay() {
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-gray-950/80 backdrop-blur-sm">
      <div className="w-10 h-10 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
      <p className="text-sm text-gray-300">Restaurando sesión…</p>
    </div>
  )
}

export default function App() {
  const { state, dispatch } = useApp()
  // Estado de presentación: cajón lateral en móvil. No afecta a la lógica de la
  // app (datos, Python, exportación, auth) — solo abre/cierra la sidebar < md.
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Lee la sesión guardada de forma síncrona en el primer render, antes de que
  // cualquier efecto pueda modificar localStorage.
  const [pendingSession, setPendingSession] = useState(() => {
    const saved = loadSession()
    return saved && saved.appMode && saved.appMode !== 'idle' && saved.rawCSVText
      ? saved
      : null
  })

  // Regenera la geometría si la sesión restaurada estaba en 'ready'/'viewer'.
  const isRehydrating = useSessionRehydration()
  useGeopackagePreload()

  function handleContinue() {
    dispatch({ type: 'RESTORE_SESSION', payload: pendingSession })
    setPendingSession(null)
  }

  function handleDiscard() {
    clearSession()
    setPendingSession(null)
  }

  return (
    <div className="flex h-dvh bg-gray-900 text-white">
      {/* Barra superior solo en móvil: abre el cajón lateral. */}
      <header className="md:hidden fixed top-0 inset-x-0 z-30 h-12 flex items-center gap-3 px-4 border-b border-gray-700 bg-gray-900">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menú"
          className="text-gray-300 hover:text-white text-xl leading-none"
        >
          ☰
        </button>
        <h1 className="text-lg font-bold tracking-wide">Point2CAD</h1>
      </header>

      {/* Fondo oscuro que cierra el cajón al tocar fuera (solo móvil). */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 transform transition-transform duration-200 md:static md:z-auto md:translate-x-0 flex flex-col gap-4 p-4 border-r border-gray-700 overflow-y-auto flex-shrink-0 ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-wide">Point2CAD</h1>
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Cerrar menú"
            className="md:hidden text-gray-400 hover:text-white text-xl leading-none"
          >
            ✕
          </button>
        </div>
        <FileUpload />
        <FeatureLibrary />
        {state.appMode === 'viewer' && (
          <>
            <button
              onClick={() => dispatch({ type: 'SET_MODE', payload: 'ready' })}
              className="w-full py-2 px-3 rounded border border-gray-700 hover:border-gray-500 text-sm text-gray-400 hover:text-white transition-colors"
            >
              ← Volver al resumen
            </button>
            <ExportPanel />
          </>
        )}
        <UserMenu />
      </aside>

      <main className="flex-1 min-w-0 flex flex-col bg-gray-950 pt-12 md:pt-0">
        {state.appMode !== 'idle' && <StageStepper />}
        <div className="flex-1 min-h-0">
          <MainArea />
        </div>
      </main>

      {pendingSession && (
        <ResumeSessionModal
          fileName={pendingSession.fileName}
          appMode={pendingSession.appMode}
          onContinue={handleContinue}
          onDiscard={handleDiscard}
        />
      )}

      {isRehydrating && <RehydratingOverlay />}
    </div>
  )
}
