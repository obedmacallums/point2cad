import { describe, it, expect } from 'vitest'
import { reducer, initialState } from './AppContext'
import { DEFAULT_PARSE_OPTIONS } from '../utils/csvLoader'

const CSV = ['nombre,x,y,z,codigo', 'P1,1,2,3,arbol', 'P2,4,5,6,poste'].join('\n')

// Estado base: CSV cargado en preview, como lo deja el flujo real.
const previewState = () =>
  reducer(initialState, {
    type: 'SET_CSV_PREVIEW',
    payload: {
      rawCSVText: CSV,
      rows: [
        { nombre: 'P1', x: '1', y: '2', z: '3', codigo: 'arbol' },
        { nombre: 'P2', x: '4', y: '5', z: '6', codigo: 'poste' },
      ],
      headers: ['nombre', 'x', 'y', 'z', 'codigo'],
      fileName: 'datos.csv',
    },
  })

const detectedState = () =>
  reducer(previewState(), {
    type: 'SET_CODES_DETECTED',
    payload: { codesSummary: [{ codigo: 'ARBOL' }, { codigo: 'POSTE' }] },
  })

describe('SET_CSV_PREVIEW', () => {
  it('entra a preview, autodetecta el mapeo y limpia lo derivado', () => {
    const dirty = {
      ...initialState,
      codesSummary: [{ codigo: 'VIEJO' }],
      featureLibrary: { VIEJO: { color: '#000000', capa: 'VIEJO' } },
      points: [{ x: 0 }],
      error: 'algo',
    }
    const state = reducer(dirty, {
      type: 'SET_CSV_PREVIEW',
      payload: {
        rawCSVText: CSV,
        rows: [],
        headers: ['nombre', 'x', 'y', 'z', 'codigo'],
        fileName: 'datos.csv',
      },
    })
    expect(state.appMode).toBe('preview')
    expect(state.columnMapping).toEqual({
      nombre: 'nombre',
      x: 'x',
      y: 'y',
      z: 'z',
      codigo: 'codigo',
    })
    expect(state.codesSummary).toEqual([])
    expect(state.featureLibrary).toEqual({})
    expect(state.points).toEqual([])
    expect(state.error).toBeNull()
    expect(state.parseOptions).toEqual(DEFAULT_PARSE_OPTIONS)
  })
})

describe('SET_PARSE_OPTIONS', () => {
  it('cambio no estructural: conserva mapeo y filas desactivadas, invalida lo derivado', () => {
    let state = detectedState()
    state = reducer(state, { type: 'TOGGLE_ROW', payload: 1 })
    const next = reducer(state, {
      type: 'SET_PARSE_OPTIONS',
      payload: { decimalSeparator: ',' },
    })
    expect(next.parseOptions.decimalSeparator).toBe(',')
    expect(next.columnMapping).toEqual(state.columnMapping)
    expect(next.disabledRows).toEqual([1])
    expect(next.codesSummary).toEqual([])
    expect(next.featureLibrary).toEqual({})
    expect(next.appMode).toBe('preview')
  })

  it('cambio estructural (hasHeader): reparsea, re-autodetecta y resetea filas', () => {
    let state = previewState()
    state = reducer(state, { type: 'TOGGLE_ROW', payload: 0 })
    const next = reducer(state, {
      type: 'SET_PARSE_OPTIONS',
      payload: { hasHeader: false },
    })
    // Sin cabecera: columnas sintéticas col_1..col_5 y una fila más (la cabecera
    // original pasa a ser dato).
    expect(next.csvHeaders).toEqual(['col_1', 'col_2', 'col_3', 'col_4', 'col_5'])
    expect(next.rawCSVRows).toHaveLength(3)
    expect(next.disabledRows).toEqual([])
    // col_N no matchea ningún sinónimo: el mapeo queda vacío.
    expect(Object.values(next.columnMapping).every((v) => v === null)).toBe(true)
  })

  it('sin CSV cargado solo actualiza las opciones', () => {
    const next = reducer(initialState, {
      type: 'SET_PARSE_OPTIONS',
      payload: { delimiter: ';' },
    })
    expect(next.parseOptions.delimiter).toBe(';')
    expect(next.appMode).toBe('idle')
  })
})

describe('SET_COLUMN_MAPPING', () => {
  it('actualiza un campo e invalida códigos y geometría', () => {
    const state = detectedState()
    const next = reducer(state, {
      type: 'SET_COLUMN_MAPPING',
      payload: { field: 'codigo', column: 'x' },
    })
    expect(next.columnMapping.codigo).toBe('x')
    expect(next.codesSummary).toEqual([])
    expect(next.featureLibrary).toEqual({})
    expect(next.controlCodes).toEqual([])
  })
})

describe('TOGGLE_ROW', () => {
  it('agrega y quita el índice', () => {
    let state = reducer(previewState(), { type: 'TOGGLE_ROW', payload: 2 })
    expect(state.disabledRows).toEqual([2])
    state = reducer(state, { type: 'TOGGLE_ROW', payload: 2 })
    expect(state.disabledRows).toEqual([])
  })
})

describe('SET_CODES_DETECTED', () => {
  it('construye la featureLibrary con defaults y pasa a codes_ready', () => {
    const state = detectedState()
    expect(state.appMode).toBe('codes_ready')
    expect(Object.keys(state.featureLibrary)).toEqual(['ARBOL', 'POSTE'])
    expect(state.featureLibrary.ARBOL.capa).toBe('ARBOL')
    expect(state.featureLibrary.ARBOL.color).toMatch(/^#/)
  })

  it('re-detectar preserva las ediciones manuales del usuario', () => {
    let state = detectedState()
    state = reducer(state, {
      type: 'UPDATE_FEATURE',
      payload: { codigo: 'ARBOL', changes: { color: '#123456' } },
    })
    const next = reducer(state, {
      type: 'SET_CODES_DETECTED',
      payload: { codesSummary: [{ codigo: 'ARBOL' }, { codigo: 'POSTE' }] },
    })
    expect(next.featureLibrary.ARBOL.color).toBe('#123456')
    expect(next.featureLibrary.POSTE).toEqual(state.featureLibrary.POSTE)
  })

  it('re-detectar conserva la visibilidad aunque no sea edición manual', () => {
    let state = detectedState()
    state = reducer(state, {
      type: 'UPDATE_FEATURE',
      payload: { codigo: 'ARBOL', changes: { visible: false } },
    })
    expect(state.userEditedCodes).toEqual([])
    const next = reducer(state, {
      type: 'SET_CODES_DETECTED',
      payload: { codesSummary: [{ codigo: 'ARBOL' }] },
    })
    expect(next.featureLibrary.ARBOL.visible).toBe(false)
  })
})

describe('UPDATE_FEATURE', () => {
  it('cambiar color o capa marca el código como editado', () => {
    const state = reducer(detectedState(), {
      type: 'UPDATE_FEATURE',
      payload: { codigo: 'ARBOL', changes: { capa: 'ARBOLES' } },
    })
    expect(state.featureLibrary.ARBOL.capa).toBe('ARBOLES')
    expect(state.userEditedCodes).toEqual(['ARBOL'])
  })

  it('cambiar solo visibilidad NO lo marca como editado', () => {
    const state = reducer(detectedState(), {
      type: 'UPDATE_FEATURE',
      payload: { codigo: 'ARBOL', changes: { visible: false } },
    })
    expect(state.userEditedCodes).toEqual([])
  })
})

describe('LOAD_FXL / CLEAR_FXL', () => {
  const fxl = {
    fileName: 'lib.fxl',
    features: { ARBOL: { color: '#abcdef', capa: 'TREES' } },
  }

  it('el FXL pisa los defaults pero no las ediciones del usuario', () => {
    let state = detectedState()
    const posteDefault = state.featureLibrary.POSTE
    state = reducer(state, {
      type: 'UPDATE_FEATURE',
      payload: { codigo: 'POSTE', changes: { color: '#999999' } },
    })
    state = reducer(state, { type: 'LOAD_FXL', payload: fxl })
    expect(state.fxl).toBe(fxl)
    expect(state.featureLibrary.ARBOL).toMatchObject({
      color: '#abcdef',
      capa: 'TREES',
    })
    // POSTE no está en el FXL y además fue editado: conserva lo del usuario.
    expect(state.featureLibrary.POSTE.color).toBe('#999999')
    expect(posteDefault.color).not.toBe('#999999')
  })

  it('quitar el FXL restaura los defaults de los códigos no editados', () => {
    let state = detectedState()
    const arbolDefault = state.featureLibrary.ARBOL
    state = reducer(state, { type: 'LOAD_FXL', payload: fxl })
    state = reducer(state, { type: 'CLEAR_FXL' })
    expect(state.fxl).toBeNull()
    expect(state.featureLibrary.ARBOL).toEqual(arbolDefault)
  })
})

describe('SET_MODE', () => {
  it('entrar al viewer restaura la visibilidad y apaga los vértices de línea', () => {
    let state = reducer(detectedState(), {
      type: 'UPDATE_FEATURE',
      payload: { codigo: 'ARBOL', changes: { visible: false } },
    })
    state = { ...state, showLineVertices: true }
    const next = reducer(state, { type: 'SET_MODE', payload: 'viewer' })
    expect(next.appMode).toBe('viewer')
    expect(next.featureLibrary.ARBOL.visible).toBe(true)
    expect(next.featureLibrary.POSTE.visible).toBe(true)
    expect(next.showLineVertices).toBe(false)
  })

  it('otros modos solo cambian appMode', () => {
    const next = reducer(previewState(), { type: 'SET_MODE', payload: 'ready' })
    expect(next.appMode).toBe('ready')
  })
})

describe('SET_ERROR', () => {
  it('error durante la detección vuelve a preview', () => {
    const state = { ...previewState(), appMode: 'detecting' }
    const next = reducer(state, { type: 'SET_ERROR', payload: 'boom' })
    expect(next.appMode).toBe('preview')
    expect(next.error).toBe('boom')
    expect(next.isProcessing).toBe(false)
  })

  it('error durante el procesamiento con códigos detectados vuelve a codes_ready', () => {
    const state = {
      ...detectedState(),
      appMode: 'processing',
      isProcessing: true,
    }
    const next = reducer(state, { type: 'SET_ERROR', payload: 'boom' })
    expect(next.appMode).toBe('codes_ready')
    expect(next.isProcessing).toBe(false)
  })
})

describe('SET_GEOMETRY', () => {
  it('guarda la geometría y pasa a ready', () => {
    const payload = { points: [{ x: 1 }], lines: [], polylines: [] }
    const next = reducer(
      { ...detectedState(), isProcessing: true },
      { type: 'SET_GEOMETRY', payload },
    )
    expect(next.appMode).toBe('ready')
    expect(next.isProcessing).toBe(false)
    expect(next.points).toEqual(payload.points)
  })
})

describe('RESTORE_SESSION', () => {
  it('sin CSV guardado arranca limpio', () => {
    expect(reducer(initialState, { type: 'RESTORE_SESSION', payload: null })).toBe(
      initialState,
    )
    expect(
      reducer(initialState, { type: 'RESTORE_SESSION', payload: {} }),
    ).toBe(initialState)
  })

  it('restaura el flujo reparseando el CSV y vaciando la geometría', () => {
    const saved = {
      appMode: 'ready',
      rawCSVText: CSV,
      columnMapping: { nombre: 'nombre', x: 'x', y: 'y', z: 'z', codigo: 'codigo' },
      disabledRows: [1],
      codesSummary: [{ codigo: 'ARBOL' }],
      featureLibrary: { ARBOL: { color: '#00ff00', capa: 'ARBOL' } },
      fileName: 'datos.csv',
      points: [{ x: 1 }], // geometría guardada: debe descartarse
    }
    const state = reducer(initialState, { type: 'RESTORE_SESSION', payload: saved })
    expect(state.appMode).toBe('ready')
    expect(state.csvHeaders).toEqual(['nombre', 'x', 'y', 'z', 'codigo'])
    expect(state.rawCSVRows).toHaveLength(2)
    expect(state.columnMapping).toEqual(saved.columnMapping)
    expect(state.disabledRows).toEqual([1])
    expect(state.featureLibrary).toEqual(saved.featureLibrary)
    // La geometría no se restaura: se regenera con useSessionRehydration.
    expect(state.points).toEqual([])
    expect(state.lines).toEqual([])
    expect(state.polylines).toEqual([])
  })

  it('rawCSVText vacío también arranca limpio', () => {
    const state = reducer(initialState, {
      type: 'RESTORE_SESSION',
      payload: { rawCSVText: '' },
    })
    expect(state).toBe(initialState)
  })
})

describe('RESET', () => {
  it('vuelve al estado inicial', () => {
    expect(reducer(detectedState(), { type: 'RESET' })).toBe(initialState)
  })
})

describe('acción desconocida', () => {
  it('devuelve el mismo estado', () => {
    const state = previewState()
    expect(reducer(state, { type: 'NO_EXISTE' })).toBe(state)
  })
})
