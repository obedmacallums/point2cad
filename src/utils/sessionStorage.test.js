// src/utils/sessionStorage.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { saveSession, loadSession, clearSession } from './sessionStorage'

// Shim de localStorage en memoria (el entorno jsdom de esta config no lo expone).
beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
  clearSession()
})

// Restaura el global a su estado real (ausente) para no filtrar el shim.
afterEach(() => {
  delete globalThis.localStorage
})

describe('sessionStorage — campos FXL', () => {
  it('persiste y recupera fxl y userEditedCodes', () => {
    const state = {
      appMode: 'ready',
      rawCSVText: 'a,b\n1,2',
      parseOptions: {},
      columnMapping: {},
      disabledRows: [],
      codesSummary: [],
      featureLibrary: {},
      controlCodes: [],
      controlOverrides: {},
      fileName: 'x.csv',
      showLineVertices: false,
      fxl: { fileName: 'lib.fxl', features: { A: { capa: 'X', color: '#fff', tipo: 'Punto' } }, controlRoles: { fin: 'end' } },
      userEditedCodes: ['A'],
    }
    saveSession(state)
    const loaded = loadSession()
    expect(loaded.fxl).toEqual(state.fxl)
    expect(loaded.userEditedCodes).toEqual(['A'])
  })

  it('omite fxl si no hay (null) sin romper', () => {
    const state = {
      appMode: 'ready', rawCSVText: 'a,b\n1,2', parseOptions: {}, columnMapping: {},
      disabledRows: [], codesSummary: [], featureLibrary: {}, controlCodes: [],
      controlOverrides: {}, fileName: 'x.csv', showLineVertices: false,
      fxl: null, userEditedCodes: [],
    }
    saveSession(state)
    const loaded = loadSession()
    expect(loaded.fxl).toBeNull()
    expect(loaded.userEditedCodes).toEqual([])
  })
})
