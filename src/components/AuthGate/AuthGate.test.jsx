import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AuthGate from './AuthGate'
import { useAuth } from '../../context/AuthContext'

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
})

function setup(authValue) {
  useAuth.mockReturnValue(authValue)
  return render(
    <AuthGate>
      <div>APP CONTENT</div>
    </AuthGate>,
  )
}

describe('AuthGate', () => {
  it('muestra los hijos cuando el acceso está permitido', () => {
    setup({ status: 'allowed' })
    expect(screen.getByText('APP CONTENT')).toBeInTheDocument()
  })

  it('muestra el login cuando no hay sesión', () => {
    setup({ status: 'signedOut', signInWithGoogle: vi.fn() })
    expect(screen.getByRole('button', { name: /entrar con google/i })).toBeInTheDocument()
    expect(screen.queryByText('APP CONTENT')).not.toBeInTheDocument()
  })

  it('muestra acceso desactivado cuando está denegado', () => {
    setup({ status: 'denied', signOut: vi.fn() })
    expect(screen.getByText(/acceso desactivado/i)).toBeInTheDocument()
    expect(screen.queryByText('APP CONTENT')).not.toBeInTheDocument()
  })

  it('muestra reintentar en estado de error', () => {
    setup({ status: 'error', retry: vi.fn() })
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
  })
})
