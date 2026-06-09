// src/context/AppContext.fxl.test.js
import { describe, it, expect } from 'vitest'
import { reducer, initialState } from './AppContext'

const codesSummary = [
  { codigo: 'CERCA', cantidad: 3, tipo: 'Línea abierta', cadenas: 1 },
  { codigo: 'ARBOL', cantidad: 2, tipo: 'Punto', cadenas: 0 },
]

const fxl = {
  fileName: 'lib.fxl',
  features: {
    CERCA: { capa: 'CERCAS', color: '#00ff00', tipo: 'Línea abierta' },
    ARBOL: { capa: 'VEGETACION', color: '#000000', tipo: 'Punto' },
  },
  controlRoles: { fin: 'end' },
}

describe('FXL en el reducer', () => {
  it('LOAD_FXL aplica capa/color del FXL sobre los defaults de paleta', () => {
    let s = { ...initialState, codesSummary }
    s = reducer(s, { type: 'SET_CODES_DETECTED', payload: { codesSummary, controlCodes: [] } })
    s = reducer(s, { type: 'LOAD_FXL', payload: fxl })
    expect(s.fxl.fileName).toBe('lib.fxl')
    expect(s.featureLibrary.CERCA.capa).toBe('CERCAS')
    expect(s.featureLibrary.CERCA.color).toBe('#00ff00')
  })

  it('FXL no pisa una edición manual previa del usuario', () => {
    let s = reducer(initialState, {
      type: 'SET_CODES_DETECTED', payload: { codesSummary, controlCodes: [] },
    })
    // El usuario edita el color de CERCA a mano.
    s = reducer(s, { type: 'UPDATE_FEATURE', payload: { codigo: 'CERCA', changes: { color: '#123456' } } })
    expect(s.userEditedCodes).toContain('CERCA')
    s = reducer(s, { type: 'LOAD_FXL', payload: fxl })
    expect(s.featureLibrary.CERCA.color).toBe('#123456') // se conserva
    expect(s.featureLibrary.ARBOL.color).toBe('#000000')  // del FXL
  })

  it('cambiar visible NO marca el código como editado por el usuario', () => {
    let s = reducer(initialState, {
      type: 'SET_CODES_DETECTED', payload: { codesSummary, controlCodes: [] },
    })
    s = reducer(s, { type: 'UPDATE_FEATURE', payload: { codigo: 'CERCA', changes: { visible: false } } })
    expect(s.userEditedCodes).not.toContain('CERCA')
  })

  it('CLEAR_FXL revierte a paleta sin borrar ediciones manuales', () => {
    let s = reducer(initialState, {
      type: 'SET_CODES_DETECTED', payload: { codesSummary, controlCodes: [] },
    })
    s = reducer(s, { type: 'UPDATE_FEATURE', payload: { codigo: 'CERCA', changes: { capa: 'MIA' } } })
    s = reducer(s, { type: 'LOAD_FXL', payload: fxl })
    s = reducer(s, { type: 'CLEAR_FXL' })
    expect(s.fxl).toBeNull()
    expect(s.featureLibrary.CERCA.capa).toBe('MIA') // edición manual sobrevive
    expect(s.featureLibrary.ARBOL.capa).toBe('ARBOL') // vuelve al default
  })
})
