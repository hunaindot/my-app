/**
 * components/TableView.jsx
 *
 * Paginated table of filtered records.
 * Label columns are reconstructed client-side from bitmasks (no API call).
 * Clicking a row selects it → the right results panel shows that record's details.
 */
import { useState, useMemo, useEffect } from 'react'
import { getIndices } from '../utils/bitmask'

const PAGE_SIZE = 25

// Column configuration: key, source group in info/bitmasks, title override, and label filter
const COLUMN_CONFIG = [
  { key: 'drivers', group: 'drivers' },
  { key: 'study_design', group: 'study_design' },
  { key: 'direction', group: 'direction' },
  // IUCN threats: separate level 0 and level 1
  { key: 'threats_l0', group: 'threats', title: 'IUCN threats (L0)', filter: l => l.level === 0 },
  { key: 'threats_l1', group: 'threats', title: 'IUCN threats (L1)', filter: l => l.level === 1 },
  // Geography: region, subregion, country/sub-national combined
  { key: 'region_l0', group: 'region', title: 'Region', filter: l => l.level === 0 },
  { key: 'region_l1', group: 'region', title: 'Subregion', filter: l => l.level === 1 },
  { key: 'region_l2', group: 'region', title: 'Country / sub-national', filter: l => l.level >= 2 },
  { key: 'realm', group: 'realm' },
]

export default function TableView({ arrowData, filteredMask, bitmasks, info, selection, onSelect }) {
  const [page, setPage] = useState(0)

  const columns = useMemo(() => {
    if (!info?.groups) return []
    // Only keep columns whose source group exists in info.json
    return COLUMN_CONFIG.filter(col => info.groups[col.group])
  }, [info])

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
              {columns.map(col => (
                <th key={col.key} className="text-left px-3 py-2 font-semibold text-gray-600 whitespace-nowrap">
                  {col.title ?? info.groups[col.group]?.name ?? col.key}
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
                  columns={columns}
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

function TableRow({ rowNum, idx, arrowData, bitmasks, info, columns, isSelected, onClick }) {
  // Reconstruct label names for this record from bitmasks
  const labels = useMemo(() => {
    const result = {}
    for (const col of columns) {
      const group = info.groups[col.group]
      if (!group) { result[col.key] = []; continue }
      const matching = []
      const masksForGroup = bitmasks[col.group] || {}
      const labelsInGroup = Object.values(group.labels)
      const candidates = col.filter ? labelsInGroup.filter(col.filter) : labelsInGroup
      for (const label of candidates) {
        const mask = masksForGroup[label.id]
        if (mask && (mask[idx >> 3] & (1 << (idx & 7)))) {
          matching.push({ name: label.name, colour: label.colour })
        }
      }
      result[col.key] = matching
    }
    return result
  }, [idx, bitmasks, info, columns])

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
      {columns.map(col => (
        <td key={col.key} className="px-3 py-2">
          <div className="flex flex-wrap gap-0.5">
            {labels[col.key]?.length > 0
              ? labels[col.key].map(l => <LabelChip key={l.name} label={l} />)
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
