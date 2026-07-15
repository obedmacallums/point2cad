import { useAuth } from '../../context/AuthContext'
import LoginScreen from './LoginScreen'
import AccessDeniedScreen from './AccessDeniedScreen'
import FullScreen from './FullScreen'

export default function AuthGate({ children }) {
  const { status, retry } = useAuth()

  // Bypass solo para desarrollo: con VITE_DISABLE_AUTH=true se salta la
  // autenticación. Doble seguridad: `import.meta.env.DEV` es false en los
  // builds de producción, así que esto nunca puede desactivar la auth en Pages.
  if (import.meta.env.DEV && import.meta.env.VITE_DISABLE_AUTH === 'true') {
    return children
  }

  // Supabase pausado o inalcanzable (plan free sin tráfico): acceso libre.
  // Mejor una app abierta que una app muerta detrás de un login que no puede
  // responder. Cuando el servicio vuelve, la autenticación se reactiva sola
  // en la siguiente visita.
  if (status === 'open') return children

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
