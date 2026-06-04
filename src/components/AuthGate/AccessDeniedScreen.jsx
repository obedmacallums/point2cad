import { useAuth } from '../../context/AuthContext'
import FullScreen from './FullScreen'

export default function AccessDeniedScreen() {
  const { signOut } = useAuth()
  return (
    <FullScreen>
      <h1 className="text-xl font-semibold">Acceso desactivado</h1>
      <p className="max-w-sm text-center text-gray-400">
        Tu cuenta no está activa. Contacta al administrador para que habilite tu acceso.
      </p>
      <button
        onClick={signOut}
        className="rounded-md border border-gray-600 px-5 py-2.5 font-medium text-gray-200 hover:bg-gray-800"
      >
        Cerrar sesión
      </button>
    </FullScreen>
  )
}
