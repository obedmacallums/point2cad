import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import UserMenu from './UserMenu'
import { useAuth } from '../../context/AuthContext'

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('UserMenu', () => {
  it('muestra el correo del usuario logueado', () => {
    useAuth.mockReturnValue({
      session: { user: { email: 'juan@example.com' } },
      signOut: vi.fn(),
    })
    render(<UserMenu />)
    expect(screen.getByText('juan@example.com')).toBeInTheDocument()
  })

  it('llama a signOut al pulsar Salir', () => {
    const signOut = vi.fn()
    useAuth.mockReturnValue({
      session: { user: { email: 'juan@example.com' } },
      signOut,
    })
    render(<UserMenu />)
    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('no renderiza nada cuando no hay sesión', () => {
    useAuth.mockReturnValue({ session: null, signOut: vi.fn() })
    const { container } = render(<UserMenu />)
    expect(container).toBeEmptyDOMElement()
  })
})
