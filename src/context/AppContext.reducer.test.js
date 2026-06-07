import { describe, it, expect } from 'vitest'
import { reducer, initialState } from './AppContext'

describe('reducer — disabledRows', () => {
  it('TOGGLE_ROW añade y quita un índice', () => {
    const s1 = reducer(initialState, { type: 'TOGGLE_ROW', payload: 2 })
    expect(s1.disabledRows).toEqual([2])

    const s2 = reducer(s1, { type: 'TOGGLE_ROW', payload: 5 })
    expect(s2.disabledRows.sort()).toEqual([2, 5])

    const s3 = reducer(s2, { type: 'TOGGLE_ROW', payload: 2 })
    expect(s3.disabledRows).toEqual([5])
  })

  it('SET_CSV_PREVIEW limpia disabledRows', () => {
    const dirty = { ...initialState, disabledRows: [1, 2] }
    const next = reducer(dirty, {
      type: 'SET_CSV_PREVIEW',
      payload: {
        rawCSVText: 'a,b\n1,2',
        rows: [{ a: '1', b: '2' }],
        headers: ['a', 'b'],
        fileName: 'x.csv',
        parseOptions: {},
      },
    })
    expect(next.disabledRows).toEqual([])
  })

  it('SET_PARSE_OPTIONS limpia disabledRows al reparsear', () => {
    const dirty = {
      ...initialState,
      rawCSVText: 'a,b\n1,2',
      disabledRows: [0],
    }
    const next = reducer(dirty, {
      type: 'SET_PARSE_OPTIONS',
      payload: { hasHeader: true },
    })
    expect(next.disabledRows).toEqual([])
  })
})
