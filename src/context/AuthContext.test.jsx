import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { supabase, singleMock } from '../lib/supabase'
import { isSupabaseDown } from '../lib/health'

// Mock de la sonda de disponibilidad: por defecto Supabase está "vivo".
vi.mock('../lib/health', () => ({ isSupabaseDown: vi.fn() }))

// Mock del cliente Supabase. `singleMock` controla la respuesta del perfil.
vi.mock('../lib/supabase', () => {
  const singleMock = vi.fn()
  return {
    singleMock,
    supabase: {
      auth: {
        getSession: vi.fn(),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
        signInWithOAuth: vi.fn(),
        signOut: vi.fn(),
      },
      from: vi.fn(() => ({
        select: () => ({ eq: () => ({ single: singleMock }) }),
      })),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  }
})

function StatusProbe() {
  const { status } = useAuth()
  return <div data-testid="status">{status}</div>
}

function SignInProbe() {
  const { status, signInWithGoogle } = useAuth()
  return (
    <>
      <div data-testid="status">{status}</div>
      <button onClick={signInWithGoogle}>login</button>
    </>
  )
}

function renderProvider() {
  return render(
    <AuthProvider>
      <StatusProbe />
    </AuthProvider>,
  )
}

const session = { user: { id: 'u1' } }

beforeEach(() => {
  vi.clearAllMocks()
  isSupabaseDown.mockResolvedValue(false)
})

describe('AuthProvider', () => {
  it('queda en signedOut cuando no hay sesión', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('signedOut'),
    )
  })

  it('queda en allowed con perfil activo', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session } })
    singleMock.mockResolvedValue({ data: { is_active: true }, error: null })
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('allowed'),
    )
  })

  it('queda en denied con perfil inactivo', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session } })
    singleMock.mockResolvedValue({ data: { is_active: false }, error: null })
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('denied'),
    )
  })

  it('queda en error si la carga del perfil falla con Supabase vivo', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session } })
    singleMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('error'),
    )
  })

  it('entra en modo abierto sin sesión cuando Supabase está caído', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    isSupabaseDown.mockResolvedValue(true)
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('open'),
    )
  })

  it('entra en modo abierto si el perfil falla porque Supabase está caído', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session } })
    singleMock.mockResolvedValue({ data: null, error: { message: 'fetch failed' } })
    isSupabaseDown.mockResolvedValue(true)
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('open'),
    )
  })

  it('el botón de login cae a modo abierto si Supabase se pausó después de cargar', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    render(
      <AuthProvider>
        <SignInProbe />
      </AuthProvider>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('signedOut'),
    )
    // Supabase se pausa mientras el usuario mira el login.
    isSupabaseDown.mockResolvedValue(true)
    await act(async () => {
      screen.getByText('login').click()
    })
    expect(screen.getByTestId('status')).toHaveTextContent('open')
    expect(supabase.auth.signInWithOAuth).not.toHaveBeenCalled()
  })

  it('el botón de login redirige al OAuth con Supabase vivo', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    supabase.auth.signInWithOAuth.mockResolvedValue({ data: {}, error: null })
    render(
      <AuthProvider>
        <SignInProbe />
      </AuthProvider>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('signedOut'),
    )
    await act(async () => {
      screen.getByText('login').click()
    })
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('status')).toHaveTextContent('signedOut')
  })

  it('con Supabase vivo y sin sesión sigue exigiendo login', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    isSupabaseDown.mockResolvedValue(false)
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('signedOut'),
    )
  })

  it('llama record_login una sola vez: dedup en SIGNED_IN repetido y omisión en TOKEN_REFRESHED', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    singleMock.mockResolvedValue({ data: { is_active: true }, error: null })

    renderProvider()

    // Wait until the component has registered the auth state change handler.
    await waitFor(() =>
      expect(supabase.auth.onAuthStateChange).toHaveBeenCalledTimes(1),
    )

    const handler = supabase.auth.onAuthStateChange.mock.calls[0][0]

    // First SIGNED_IN — should call record_login once.
    await act(async () => {
      handler('SIGNED_IN', session)
    })
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('record_login')

    // Second SIGNED_IN for the same user — should NOT call record_login again.
    await act(async () => {
      handler('SIGNED_IN', session)
    })
    expect(supabase.rpc).toHaveBeenCalledTimes(1)

    // TOKEN_REFRESHED — should never trigger record_login.
    await act(async () => {
      handler('TOKEN_REFRESHED', session)
    })
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })
})
