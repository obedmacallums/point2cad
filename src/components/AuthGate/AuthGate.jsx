import { useAuth } from '../../context/AuthContext'
import LoginScreen from './LoginScreen'
import AccessDeniedScreen from './AccessDeniedScreen'
import FullScreen from './FullScreen'

export default function AuthGate({ children }) {
  const { status, retry } = useAuth()

  if (status === 'loading') {
    return (
      <FullScreen>
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
        <p className="text-gray-400">Verificando acceso…</p>
      </FullScreen>
    )
  }

  if (status === 'signedOut') return <LoginScreen />
  if (status === 'denied') return <AccessDeniedScreen />

  if (status === 'error') {
    return (
      <FullScreen>
        <p className="text-gray-300">No se pudo verificar tu acceso.</p>
        <button
          onClick={retry}
          className="rounded-md bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-500"
        >
          Reintentar
        </button>
      </FullScreen>
    )
  }

  return children
}
