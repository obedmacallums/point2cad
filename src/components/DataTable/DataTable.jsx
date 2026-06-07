import { useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
} from '@tanstack/react-table'

// Props opcionales para desactivar filas:
//   onToggleRow(index)  — si se pasa, cada fila es clickeable y aparece una
//                         columna líder con el botón quitar/restaurar.
//   isRowDisabled(index) — marca la fila como desactivada (estilo rojo/tachado).
// `index` es el índice de la fila dentro de `data` (== índice en rawCSVRows,
// porque el preview pasa siempre un slice desde el inicio).
export default function DataTable({
  columns,
  data,
  maxHeight = '100%',
  isRowDisabled,
  onToggleRow,
}) {
  const [sorting, setSorting] = useState([])
  const selectable = typeof onToggleRow === 'function'

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div
      className="overflow-auto rounded-lg border border-gray-700 text-xs"
      style={{ maxHeight }}
    >
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-gray-800">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {selectable && (
                <th className="w-8 px-2 py-2 border-b border-gray-700" />
              )}
              {hg.headers.map((header) => {
                const extra = header.column.columnDef.meta?.headerClassName ?? ''
                return (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={`px-3 py-2 text-left text-gray-300 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-gray-700 transition-colors border-b border-gray-700 ${extra}`}
                  >
                    <span className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <span className="text-gray-500 text-[10px]">
                        {{ asc: '↑', desc: '↓' }[header.column.getIsSorted()] ?? '⇅'}
                      </span>
                    </span>
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>

        <tbody>
          {table.getRowModel().rows.map((row, i) => {
            const disabled = isRowDisabled?.(row.index) ?? false
            return (
            <tr
              key={row.id}
              onClick={selectable ? () => onToggleRow(row.index) : undefined}
              className={`border-b border-gray-800 transition-colors ${
                selectable ? 'cursor-pointer' : ''
              } ${
                disabled
                  ? 'bg-red-950/40 text-gray-500 line-through hover:bg-red-950/60'
                  : `hover:bg-gray-800/60 ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-900/60'}`
              }`}
            >
              {selectable && (
                <td className="w-8 px-2 py-1.5 text-center no-underline">
                  <span
                    className={disabled ? 'text-amber-400' : 'text-gray-500 hover:text-red-400'}
                    title={disabled ? 'Restaurar fila' : 'Quitar fila'}
                  >
                    {disabled ? '↺' : '✕'}
                  </span>
                </td>
              )}
              {row.getVisibleCells().map((cell) => {
                const extra = cell.column.columnDef.meta?.cellClassName ?? ''
                return (
                  <td
                    key={cell.id}
                    className={`px-3 py-1.5 text-gray-200 font-mono whitespace-nowrap ${extra}`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                )
              })}
            </tr>
            )
          })}
        </tbody>
      </table>

      {data.length === 0 && (
        <p className="text-center text-gray-500 py-6">Sin datos</p>
      )}
    </div>
  )
}
