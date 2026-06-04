import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { deriveAuthStatus } from '../lib/authStatus'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [initializing, setInitializing] = useState(true)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState(null)
  const recordedFor = useRef(null)

  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) {
      setProfileError(error)
      setProfile(null)
    } else {
      setProfileError(null)
      setProfile(data)
    }
  }

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      const s = data.session
      setSession(s)
      if (s) {
        loadProfile(s.user.id).finally(() => {
          if (active) setInitializing(false)
        })
      } else {
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
    status: deriveAuthStatus({ initializing, session, profile, profileError }),
    signInWithGoogle: () =>
      supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + import.meta.env.BASE_URL,
        },
      }),
    signOut: () => supabase.auth.signOut(),
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
