/**
 * components/TableView.jsx
 *
 * Paginated table of filtered records.
 * Label columns are reconstructed client-side from bitmasks (no API call).
 * Clicking a row selects it → the right results panel shows that record's details.
 */
import { useState, useMemo, useEffect } from 'react'
import { getIndices } from '../utils/bitmask'

// Columns shown in the table (subset of all groups — keeps it readable)
const COLUMNS = ['drivers', 'realm', 'study_design', 'direction']

const PAGE_SIZE = 25

export default function TableView({ arrowData, filteredMask, bitmasks, info, selection, onSelect }) {
  const [page, setPage] = useState(0)

  // Reset page when filter changes
  useEffect(() => { setPage(0) }, [filteredMask])

  // All filtered record indices, in slim.arrow order
  const filteredIndices = useMemo(() => {
    if (!arrowData) return []
    if (!filteredMask) return Array.from({ length: arrowData.length }, (_, i) => i)
    return Array.from(getIndices(filteredMask))
  }, [arrowData, filteredMask])

  const totalPages  = Math.ceil(filteredIndices.length / PAGE_SIZE)
  const pageIndices = filteredIndices.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const selectedSet = selection ? new Set(Array.from(selection)) : null

  if (!arrowData || !info) return null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Scrollable table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-white z-10 shadow-sm">
            <tr className="border-b border-gray-200">
              <th className="text-left px-3 py-2 font-semibold text-gray-600 w-8">#</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-600">Title</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-600 w-12">Year</th>
              {COLUMNS.map(col => (
                <th key={col} className="text-left px-3 py-2 font-semibold text-gray-600 whitespace-nowrap">
                  {info.groups[col]?.name ?? col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageIndices.map((idx, i) => {
              const isSelected = selectedSet?.has(idx)
              return (
                <TableRow
                  key={idx}
                  rowNum={page * PAGE_SIZE + i + 1}
                  idx={idx}
                  arrowData={arrowData}
                  bitmasks={bitmasks}
                  info={info}
                  isSelected={isSelected}
                  onClick={() => onSelect(isSelected ? null : new Int32Array([idx]))}
                />
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-t border-gray-100 bg-white">
        <span className="text-xs text-gray-400">
          {filteredIndices.length.toLocaleString()} records
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
          >
            ‹
          </button>
          <span className="text-xs text-gray-500 px-1">
            {page + 1} / {Math.max(1, totalPages)}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  )
}

function TableRow({ rowNum, idx, arrowData, bitmasks, info, isSelected, onClick }) {
  // Reconstruct label names for this record from bitmasks
  const labels = useMemo(() => {
    const result = {}
    for (const col of COLUMNS) {
      const group = info.groups[col]
      if (!group) { result[col] = []; continue }
      const matching = []
      for (const [labelKey, label] of Object.entries(group.labels)) {
        const mask = bitmasks[labelKey]
        if (mask && (mask[idx >> 3] & (1 << (idx & 7)))) {
          matching.push({ name: label.name, colour: label.colour })
        }
      }
      result[col] = matching
    }
    return result
  }, [idx, bitmasks, info])

  return (
    <tr
      onClick={onClick}
      className={`border-b border-gray-100 cursor-pointer transition-colors
        ${isSelected
          ? 'bg-amber-50 hover:bg-amber-100'
          : 'hover:bg-gray-50'
        }`}
    >
      <td className="px-3 py-2 text-gray-400 tabular-nums">{rowNum}</td>
      <td className="px-3 py-2 max-w-xs">
        <span
          className="block truncate text-gray-900"
          title={arrowData.title[idx]}
        >
          {arrowData.title[idx]}
        </span>
      </td>
      <td className="px-3 py-2 text-gray-600 tabular-nums whitespace-nowrap">
        {arrowData.year[idx]}
      </td>
      {COLUMNS.map(col => (
        <td key={col} className="px-3 py-2">
          <div className="flex flex-wrap gap-0.5">
            {labels[col]?.length > 0
              ? labels[col].map(l => <LabelChip key={l.name} label={l} />)
              : <span className="text-gray-300">—</span>
            }
          </div>
        </td>
      ))}
    </tr>
  )
}

function LabelChip({ label }) {
  const [h, s, l] = label.colour ?? [0, 0, 70]
  return (
    <span
      className="inline-block text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap"
      style={{ backgroundColor: `hsl(${h},${s}%,92%)`, color: `hsl(${h},${s}%,28%)` }}
    >
      {label.name}
    </span>
  )
}
