import { describe, it, expect } from 'vitest'
import { deriveAuthStatus } from './authStatus'

describe('deriveAuthStatus', () => {
  it('devuelve loading mientras inicializa', () => {
    expect(deriveAuthStatus({ initializing: true })).toBe('loading')
  })

  it('devuelve signedOut sin sesión', () => {
    expect(
      deriveAuthStatus({ initializing: false, session: null }),
    ).toBe('signedOut')
  })

  it('devuelve error si falló la carga del perfil', () => {
    expect(
      deriveAuthStatus({
        initializing: false,
        session: { user: { id: 'u1' } },
        profile: null,
        profileError: { message: 'boom' },
      }),
    ).toBe('error')
  })

  it('devuelve loading si hay sesión pero el perfil aún no cargó', () => {
    expect(
      deriveAuthStatus({
        initializing: false,
        session: { user: { id: 'u1' } },
        profile: null,
        profileError: null,
      }),
    ).toBe('loading')
  })

  it('devuelve allowed si el perfil está activo', () => {
    expect(
      deriveAuthStatus({
        initializing: false,
        session: { user: { id: 'u1' } },
        profile: { is_active: true },
      }),
    ).toBe('allowed')
  })

  it('devuelve open si Supabase está caído, sin importar lo demás', () => {
    expect(
      deriveAuthStatus({ initializing: true, supabaseDown: true }),
    ).toBe('open')
    expect(
      deriveAuthStatus({
        initializing: false,
        session: null,
        supabaseDown: true,
      }),
    ).toBe('open')
  })

  it('devuelve denied si el perfil está inactivo', () => {
    expect(
      deriveAuthStatus({
        initializing: false,
        session: { user: { id: 'u1' } },
        profile: { is_active: false },
      }),
    ).toBe('denied')
  })
})
