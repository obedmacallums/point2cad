import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // No es secreto: la anon key es pública por diseño. Solo avisamos si falta.
  console.warn('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY')
}

// Sin configuración, createClient lanza y la app moriría en pantalla blanca
// antes de montar React. Exportamos null y AuthContext lo trata como
// "Supabase caído" → modo abierto (misma política que lib/health.js).
export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null
