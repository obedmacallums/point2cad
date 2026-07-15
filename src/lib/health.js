// Sonda de disponibilidad de Supabase. Los proyectos del plan free se pausan
// tras una semana sin tráfico; cuando eso pasa, la app entra en "modo abierto"
// (acceso sin credenciales) en vez de bloquear a todo el mundo en el login.
//
// Solo cuenta como caído un fallo de red/timeout o un 5xx del gateway (lo que
// devuelve un proyecto pausado). Cualquier otra respuesta HTTP significa que
// el servicio está vivo y la autenticación debe seguir siendo obligatoria.
export async function isSupabaseDown(timeoutMs = 4000) {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  // Sin configuración no hay forma de autenticar: se considera caído para que
  // la app siga siendo usable (mismo espíritu que el modo abierto).
  if (!url || !anonKey) return true

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey },
      signal: controller.signal,
    })
    return res.status >= 500
  } catch {
    return true // fallo de red o timeout: inalcanzable
  } finally {
    clearTimeout(timer)
  }
}
