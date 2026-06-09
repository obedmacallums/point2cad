// src/components/FxlImport/FxlImport.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import FxlImport from './FxlImport'
import { useApp } from '../../context/AppContext'
import { useFxlLoader } from '../../hooks/useFxlLoader'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../hooks/useFxlLoader', () => ({ useFxlLoader: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  useFxlLoader.mockReturnValue({ loadFxl: vi.fn(), error: null, loading: false })
})

describe('FxlImport', () => {
  it('ofrece cargar una biblioteca cuando no hay FXL', () => {
    useApp.mockReturnValue({ state: { fxl: null }, dispatch: vi.fn() })
    render(<FxlImport />)
    expect(screen.getByText(/biblioteca de características/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /importar .*\.fxl/i })).toBeInTheDocument()
  })

  it('muestra el resumen y el botón Quitar cuando hay FXL', () => {
    useApp.mockReturnValue({
      state: {
        fxl: {
          fileName: 'lib.fxl',
          features: { A: {}, B: {} },
          controlRoles: { fin: 'end' },
        },
      },
      dispatch: vi.fn(),
    })
    render(<FxlImport />)
    expect(screen.getByText(/lib\.fxl/)).toBeInTheDocument()
    expect(screen.getByText(/2 códigos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /quitar/i })).toBeInTheDocument()
  })

  it('muestra el error de carga', () => {
    useApp.mockReturnValue({ state: { fxl: null }, dispatch: vi.fn() })
    useFxlLoader.mockReturnValue({
      loadFxl: vi.fn(), error: 'No se pudo leer el FXL: x', loading: false,
    })
    render(<FxlImport />)
    expect(screen.getByText(/no se pudo leer el fxl/i)).toBeInTheDocument()
  })
})
