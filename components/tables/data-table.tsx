'use client'

import {
  useReactTable, getCoreRowModel, flexRender,
  type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { useEffect, useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DataTableProps<T> {
  columns: ColumnDef<T, any>[]
  data: T[]
  total: number
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  onRowClick?: (row: T) => void
  isLoading?: boolean
  filters?: React.ReactNode
  sort?: string
  dir?: 'asc' | 'desc'
  onSort?: (field: string, dir: 'asc' | 'desc') => void
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3.5 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" style={{ width: `${40 + Math.random() * 50}%` }} />
        </td>
      ))}
    </tr>
  )
}

export function DataTable<T>({
  columns, data, total, page, totalPages,
  onPageChange, onRowClick, isLoading, filters, sort, dir, onSort
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      setSorting(next)
      // Propagar para a página pai se onSort fornecido
      if (onSort && next.length > 0) {
        onSort(next[0].id, next[0].desc ? 'desc' : 'asc')
      } else if (onSort && next.length === 0) {
        // clicou 3x — reset para default (ignorar ou definir default na página)
      }
    },
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,   // NOVO — desliga sort client-side
    pageCount: totalPages,
    enableSortingRemoval: false, // NOVO — alterna só asc/desc sem reset
  })

  useState(() => {
    if (sort) {
      setSorting([{ id: sort, desc: dir === 'desc' }])
    }
  })

  useEffect(() => {
  if (sort) setSorting([{ id: sort, desc: dir === 'desc' }])
}, [sort, dir])

  return (
    <div className="flex flex-col gap-3">
      {/* Filters bar */}
      {filters && (
        <div className="flex flex-wrap gap-2 items-center">
          {filters}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
        {/* Table wrapper — horizontal scroll on small screens */}
        <div className="crc-scrollbar overflow-x-auto bg-slate-50/40 dark:bg-slate-950/20">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap"
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={cn('flex items-center gap-1', header.column.getCanSort() && 'cursor-pointer select-none')}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <span className="text-slate-300 dark:text-slate-600">
                              {header.column.getIsSorted() === 'asc'
                                ? <ChevronUp className="w-3 h-3" />
                                : header.column.getIsSorted() === 'desc'
                                  ? <ChevronDown className="w-3 h-3" />
                                  : <ChevronsUpDown className="w-3 h-3" />}
                            </span>
                          )}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} cols={columns.length} />)
                : table.getRowModel().rows.length === 0
                  ? (
                    <tr>
                      <td colSpan={columns.length} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                          <span className="text-3xl">🔍</span>
                          <span className="text-sm">Nenhum registro encontrado.</span>
                        </div>
                      </td>
                    </tr>
                  )
                  : table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => onRowClick?.(row.original)}
                      className={cn(
                        'transition-colors',
                        onRowClick && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-2.5 text-slate-700 dark:text-slate-300 whitespace-nowrap text-sm">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-50 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {total.toLocaleString('pt-BR')} registro{total !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-slate-600 dark:text-slate-400 min-w-[80px] text-center">
              {page} / {totalPages || 1}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
