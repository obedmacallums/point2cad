import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { supabase, singleMock } from '../lib/supabase'

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

  it('queda en error si la carga del perfil falla', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session } })
    singleMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('error'),
    )
  })
})
