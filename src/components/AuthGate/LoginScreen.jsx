import { useAuth } from '../../context/AuthContext'

export default function LoginScreen() {
  const { signInWithGoogle } = useAuth()
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-gray-950 text-gray-100">
      <h1 className="text-2xl font-semibold">Point2CAD</h1>
      <p className="text-gray-400">Inicia sesión para continuar</p>
      <button
        onClick={signInWithGoogle}
        className="rounded-md bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-500"
      >
        Entrar con Google
      </button>
    </div>
  )
}
