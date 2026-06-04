// Mapea el estado crudo de autenticación al estado de UI que consume AuthGate.
// status ∈ 'loading' | 'signedOut' | 'allowed' | 'denied' | 'error'
export function deriveAuthStatus({ initializing, session, profile, profileError }) {
  if (initializing) return 'loading'
  if (!session) return 'signedOut'
  if (profileError) return 'error'
  if (!profile) return 'loading'
  return profile.is_active ? 'allowed' : 'denied'
}
