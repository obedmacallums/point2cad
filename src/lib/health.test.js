import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isSupabaseDown } from './health'

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('isSupabaseDown', () => {
  it('vivo con 200 en el health endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200 }))
    expect(await isSupabaseDown()).toBe(false)
    expect(fetch).toHaveBeenCalledWith(
      'https://proj.supabase.co/auth/v1/health',
      expect.objectContaining({ headers: { apikey: 'anon-key' } }),
    )
  })

  it('un 4xx sigue contando como vivo (solo 5xx es caído)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404 }))
    expect(await isSupabaseDown()).toBe(false)
  })

  it('caído con 5xx del gateway (proyecto pausado)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 540 }))
    expect(await isSupabaseDown()).toBe(true)
  })

  it('caído si el fetch falla a nivel de red', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    expect(await isSupabaseDown()).toBe(true)
  })

  it('caído si falta la configuración (no se llega a llamar fetch)', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await isSupabaseDown()).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
