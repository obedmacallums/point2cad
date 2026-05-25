import { useApp } from './context/AppContext'
import FileUpload from './components/FileUpload/FileUpload'
import Viewer3D from './components/Viewer3D/Viewer3D'
import CSVPreview from './components/CSVPreview/CSVPreview'
import ResultsPanel from './components/ResultsPanel/ResultsPanel'
import FeatureLibrary from './components/FeatureLibrary/FeatureLibrary'
import ExportPanel from './components/ExportPanel/ExportPanel'
import IdleDropZone from './components/IdleDropZone/IdleDropZone'

function MainArea() {
  const { state, dispatch } = useApp()

  switch (state.appMode) {
    case 'preview':
    case 'detecting':
    case 'codes_ready':
    case 'processing':
      return <CSVPreview />

    case 'ready':
      return <ResultsPanel />

    case 'viewer':
      return <Viewer3D />

    default:
      return <IdleDropZone />
  }
}

export default function App() {
  const { state, dispatch } = useApp()

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      <aside className="w-64 flex flex-col gap-4 p-4 border-r border-gray-700 overflow-y-auto flex-shrink-0">
        <h1 className="text-lg font-bold tracking-wide">Point2CAD</h1>
        <FileUpload />
        <FeatureLibrary />
        {state.appMode === 'viewer' && (
          <button
            onClick={() => dispatch({ type: 'SET_MODE', payload: 'ready' })}
            className="w-full py-2 px-3 rounded border border-gray-700 hover:border-gray-500 text-sm text-gray-400 hover:text-white transition-colors"
          >
            ← Volver al resumen
          </button>
        )}
        <ExportPanel />
      </aside>

      <main className="flex-1 min-w-0 bg-gray-950">
        <MainArea />
      </main>
    </div>
  )
}
