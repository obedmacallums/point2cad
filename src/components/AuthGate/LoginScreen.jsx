import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import FullScreen from './FullScreen'

export default function LoginScreen() {
  const { signInWithGoogle } = useAuth()
  // signInWithGoogle sondea Supabase antes de redirigir (hasta 4s si está
  // caído): el botón muestra progreso para no parecer muerto mientras tanto.
  const [checking, setChecking] = useState(false)

  const handleClick = async () => {
    setChecking(true)
    try {
      await signInWithGoogle()
    } finally {
      setChecking(false)
    }
  }

  return (
    <FullScreen>
      <h1 className="text-2xl font-semibold">Point2CAD</h1>
      <p className="text-gray-400">Inicia sesión para continuar</p>
      <button
        onClick={handleClick}
        disabled={checking}
        className="rounded-md bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60"
      >
        {checking ? 'Conectando…' : 'Entrar con Google'}
      </button>
    </FullScreen>
  )
}
