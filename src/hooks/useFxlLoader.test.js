// src/hooks/useFxlLoader.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFxlLoader } from './useFxlLoader'
import { useApp } from '../context/AppContext'
import { usePythonBridge } from './usePythonBridge'

vi.mock('../context/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('./usePythonBridge', () => ({ usePythonBridge: vi.fn() }))

const dispatch = vi.fn()
const parseFxl = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  useApp.mockReturnValue({ dispatch })
  usePythonBridge.mockReturnValue({ parseFxl })
})

function fakeFile(text, name = 'lib.fxl') {
  return { name, text: () => Promise.resolve(text) }
}

describe('useFxlLoader', () => {
  it('parsea y despacha LOAD_FXL con el nombre del archivo', async () => {
    parseFxl.mockResolvedValue({
      features: { A: { capa: 'X', color: '#fff', tipo: 'Punto' } },
      control_roles: { fin: 'end' },
    })
    const { result } = renderHook(() => useFxlLoader())
    await act(async () => { await result.current.loadFxl(fakeFile('<xml/>', 'mi.fxl')) })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'LOAD_FXL',
      payload: {
        fileName: 'mi.fxl',
        features: { A: { capa: 'X', color: '#fff', tipo: 'Punto' } },
        controlRoles: { fin: 'end' },
      },
    })
  })

  it('reporta error y NO despacha LOAD_FXL si el parseo falla', async () => {
    parseFxl.mockRejectedValue(new Error('FXL no es XML válido'))
    const { result } = renderHook(() => useFxlLoader())
    let err
    await act(async () => { err = await result.current.loadFxl(fakeFile('basura')) })
    expect(err).toMatch(/FXL/)
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'LOAD_FXL' }),
    )
  })

  it('avisa cuando el FXL no contiene códigos ni control codes', async () => {
    parseFxl.mockResolvedValue({ features: {}, control_roles: {} })
    const { result } = renderHook(() => useFxlLoader())
    let err
    await act(async () => { err = await result.current.loadFxl(fakeFile('<empty/>')) })
    expect(err).toMatch(/no contiene/i)
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'LOAD_FXL' }),
    )
  })
})
