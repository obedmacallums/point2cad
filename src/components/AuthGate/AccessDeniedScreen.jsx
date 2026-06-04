import { useAuth } from '../../context/AuthContext'

export default function AccessDeniedScreen() {
  const { signOut } = useAuth()
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-gray-950 text-gray-100">
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
    </div>
  )
}
