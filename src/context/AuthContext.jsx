import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { deriveAuthStatus } from '../lib/authStatus'
import { isSupabaseDown } from '../lib/health'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [initializing, setInitializing] = useState(true)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState(null)
  const [supabaseDown, setSupabaseDown] = useState(false)
  const recordedFor = useRef(null)

  async function loadProfile(userId) {
    if (!supabase) return
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) {
      // Distinguir "Supabase pausado/caído" (→ modo abierto) de un error real
      // del perfil (→ pantalla de error con reintento). Lo decide la sonda.
      if (await isSupabaseDown()) {
        setSupabaseDown(true)
        setProfileError(null)
        setProfile(null)
        return
      }
      setProfileError(error)
      setProfile(null)
    } else {
      setSupabaseDown(false)
      setProfileError(null)
      setProfile(data)
    }
  }

  useEffect(() => {
    let active = true

    // Sin cliente (faltan las vars VITE_SUPABASE_*) no hay forma de autenticar:
    // directo a modo abierto, sin sondear nada.
    if (!supabase) {
      setSupabaseDown(true)
      setInitializing(false)
      return
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      const s = data.session
      setSession(s)
      if (s) {
        loadProfile(s.user.id).finally(() => {
          if (active) setInitializing(false)
        })
      } else {
        // Sin sesión local no hay ninguna llamada que falle "sola": sondeamos
        // antes de mostrar el login para no exigir credenciales imposibles
        // cuando Supabase está pausado. Se resuelve antes de cerrar el loading
        // para no parpadear el LoginScreen.
        const down = await isSupabaseDown()
        if (!active) return
        setSupabaseDown(down)
        setInitializing(false)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (!s) {
        setProfile(null)
        setProfileError(null)
        recordedFor.current = null
        return
      }
      // Registrar el login una sola vez por sesión nueva (evento SIGNED_IN
      // tras el redirect), no en refrescos de token ni recargas.
      if (event === 'SIGNED_IN' && recordedFor.current !== s.user.id) {
        recordedFor.current = s.user.id
        supabase.rpc('record_login').then(() => loadProfile(s.user.id))
      } else {
        loadProfile(s.user.id)
      }
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = {
    session,
    profile,
    status: deriveAuthStatus({ initializing, session, profile, profileError, supabaseDown }),
    // Sondea antes de redirigir al OAuth: si Supabase se pausó mientras el
    // usuario tenía el login abierto, el authorize apunta a un dominio sin DNS
    // y Chrome muestra un error irrecuperable. Mejor caer a modo abierto.
    signInWithGoogle: async () => {
      if (!supabase || (await isSupabaseDown())) {
        setSupabaseDown(true)
        return
      }
      return supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + import.meta.env.BASE_URL,
        },
      })
    },
    signOut: () => supabase?.auth.signOut(),
    retry: () => {
      if (session) loadProfile(session.user.id)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
