import { useAuth } from '../../context/AuthContext'

export default function UserMenu() {
  const { session, signOut } = useAuth()
  const email = session?.user?.email
  if (!email) return null

  return (
    <div className="mt-auto pt-3 border-t border-gray-800 flex items-center justify-between gap-2">
      <span className="text-xs text-gray-400 truncate" title={email}>
        {email}
      </span>
      <button
        onClick={signOut}
        title="Cerrar sesión"
        aria-label="Cerrar sesión"
        className="shrink-0 text-sm text-gray-400 hover:text-white transition-colors"
      >
        Salir
      </button>
    </div>
  )
}
