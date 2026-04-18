import { useMemo, useState, useEffect } from 'react'
import { countIntersection } from '../utils/bitmask'

function levelLabelsForGroup(groupKey, level) {
  if (groupKey === 'realm')   return { 0: 'Realm', 1: 'Biome', 2: 'EFG' }[level] || `Level ${level}`
  if (groupKey === 'region')  return { 0: 'Region', 1: 'Subregion', 2: 'Country / sub-national' }[level] || `Level ${level}`
  if (groupKey === 'threats') return { 0: 'Threat category', 1: 'Sub-category' }[level] || `Level ${level}`
  return `Level ${level}`
}

function buildAxisOptions(info) {
  const out = []
  for (const [groupKey, group] of Object.entries(info?.groups || {})) {
    const labels = Object.values(group.labels || {})
    if (group.type === 'hierarchical') {
      let levels = Array.from(new Set(labels.map(l => l.level ?? 0))).sort((a, b) => a - b)
      if (groupKey === 'threats') levels = levels.filter(l => l <= 1)
      for (const level of levels) {
        out.push({ id: `${groupKey}|${level}`, groupKey, level, label: `${group.name} · ${levelLabelsForGroup(groupKey, level)}` })
      }
      out.push({ id: `${groupKey}|all`, groupKey, level: null, label: `${group.name} · All levels` })
    } else {
      out.push({ id: `${groupKey}|all`, groupKey, level: null, label: group.name })
    }
  }
  return out
}

export default function MatrixView({ info, bitmasks, filteredMask, activeFilters, onSetGroup }) {
  const axisOptions = useMemo(() => buildAxisOptions(info), [info])
  const defaultRows = axisOptions.find(o => o.groupKey === 'drivers' && o.level == null)?.id ?? axisOptions[0]?.id ?? ''
  const defaultCols = axisOptions.find(o => o.groupKey === 'realm'   && o.level == null)?.id ?? axisOptions[1]?.id ?? defaultRows

  const [rowAxisId,  setRowAxisId]  = useState(defaultRows)
  const [colAxisId,  setColAxisId]  = useState(defaultCols)
  const [mode,       setMode]       = useState('hotspot') // 'hotspot' | 'gap'
  const [useLog,     setUseLog]     = useState(true)

  useEffect(() => {
    if (!info || axisOptions.length === 0) return
    const validIds = new Set(axisOptions.map(o => o.id))
    if (!validIds.has(rowAxisId)) setRowAxisId(defaultRows)
    if (!validIds.has(colAxisId)) setColAxisId(defaultCols)
  }, [info, axisOptions, defaultRows, defaultCols, rowAxisId, colAxisId])

  const rowAxis = axisOptions.find(o => o.id === rowAxisId)
  const colAxis = axisOptions.find(o => o.id === colAxisId)
  const rowGroup = info?.groups?.[rowAxis?.groupKey]
  const colGroup = info?.groups?.[colAxis?.groupKey]

  function isAncestor(ancestorId, nodeId, labels) {
    let cur = labels?.[nodeId]
    while (cur?.parent) { if (cur.parent === ancestorId) return true; cur = labels[cur.parent] }
    return false
  }
  function withinSelectedTree(label, groupKey, labels) {
    const selected = activeFilters?.[groupKey]
    if (!selected || selected.size === 0) return true
    for (const id of selected) {
      if (label.id === id) return true
      if (isAncestor(id, label.id, labels)) return true
      if (isAncestor(label.id, id, labels)) return true
    }
    return false
  }

  const rowLabels = useMemo(() => {
    if (!rowGroup) return []
    const labels = Object.values(rowGroup.labels || {})
    const filtered = rowAxis?.level == null ? labels : labels.filter(l => (l.level ?? 0) === rowAxis.level)
    return filtered.filter(l => withinSelectedTree(l, rowAxis.groupKey, rowGroup.labels)).sort((a, b) => a.name.localeCompare(b.name))
  }, [rowGroup, rowAxis, activeFilters])

  const colLabels = useMemo(() => {
    if (!colGroup) return []
    const labels = Object.values(colGroup.labels || {})
    const filtered = colAxis?.level == null ? labels : labels.filter(l => (l.level ?? 0) === colAxis.level)
    return filtered.filter(l => withinSelectedTree(l, colAxis.groupKey, colGroup.labels)).sort((a, b) => a.name.localeCompare(b.name))
  }, [colGroup, colAxis, activeFilters])

  const byteLength = useMemo(() => {
    const masksForGroup = bitmasks?.[rowAxis?.groupKey] || bitmasks?.[colAxis?.groupKey]
    const first = masksForGroup && Object.values(masksForGroup)[0]
    return first?.length ?? 0
  }, [bitmasks, rowAxis, colAxis])

  const { matrix, maxValue, rows, cols } = useMemo(() => {
    if (!bitmasks || !rowGroup || !colGroup) return { matrix: [], maxValue: 0, rows: [], cols: [] }
    const vMasks = bitmasks[rowAxis.groupKey] || {}
    const hMasks = bitmasks[colAxis.groupKey] || {}
    let max = 0
    const rawRows = rowLabels.map(v => rowLabels && colLabels.map(h => {
      const count = countIntersection(vMasks[v.id], hMasks[h.id], filteredMask || null, byteLength)
      if (count > max) max = count
      return count
    }))
    const rowHasValue = rawRows.map(r => r.some(v => v > 0))
    const colHasValue = colLabels.map((_, c) => rawRows.some(r => r[c] > 0))
    const rows = rowLabels.filter((_, i) => rowHasValue[i])
    const cols = colLabels.filter((_, i) => colHasValue[i])
    const matrix = rawRows.filter((_, i) => rowHasValue[i]).map(r => r.filter((_, i) => colHasValue[i]))
    return { matrix, maxValue: max, rows, cols }
  }, [bitmasks, rowGroup, colGroup, rowLabels, colLabels, filteredMask, byteLength, rowAxis, colAxis])

  // Expected counts for evidence gap mode
  const { rowTotals, colTotals, grandTotal } = useMemo(() => {
    if (!matrix.length) return { rowTotals: [], colTotals: [], grandTotal: 0 }
    const rowTotals = matrix.map(row => row.reduce((s, v) => s + v, 0))
    const colTotals = cols.map((_, c) => matrix.reduce((s, row) => s + (row[c] ?? 0), 0))
    const grandTotal = rowTotals.reduce((s, v) => s + v, 0)
    return { rowTotals, colTotals, grandTotal }
  }, [matrix, cols])

  const maxScaled = useLog ? Math.log10(maxValue + 1) : maxValue

  // Hotspot: moss green scale
  function hotspotColor(value) {
    if (maxScaled <= 0) return '#f9fafb'
    const raw = useLog ? Math.log10(value + 1) : value
    const t = Math.min(1, Math.max(0, raw / maxScaled))
    if (t < 0.15) return '#f9fafb'
    if (t < 0.35) return 'hsl(140,22%,91%)'
    if (t < 0.55) return 'hsl(140,32%,77%)'
    if (t < 0.75) return 'hsl(140,42%,58%)'
    return '#2d5238'
  }

  // Evidence gap: clay color for under-represented cells
  function gapColor(observed, rowIdx, colIdx) {
    if (grandTotal === 0) return '#f9fafb'
    const expected = (rowTotals[rowIdx] * colTotals[colIdx]) / grandTotal
    if (expected < 1) return '#f9fafb'
    const ratio = observed / expected
    if (ratio >= 1.0) return '#f9fafb'
    if (ratio >= 0.7) return 'hsl(20,30%,94%)'
    if (ratio >= 0.4) return 'hsl(20,45%,82%)'
    if (ratio >= 0.2) return 'hsl(20,55%,68%)'
    return '#b45a3d'
  }

  function cellColor(value, rowIdx, colIdx) {
    return mode === 'hotspot' ? hotspotColor(value) : gapColor(value, rowIdx, colIdx)
  }

  function textColor(value, rowIdx, colIdx) {
    const bg = cellColor(value, rowIdx, colIdx)
    return (bg === '#2d5238' || bg === '#b45a3d') ? '#ffffff' : '#111827'
  }

  function swapAxes() { setRowAxisId(colAxisId); setColAxisId(rowAxisId) }

  function applyCellFilters(vId, hId) {
    if (!onSetGroup || !rowAxis?.groupKey || !colAxis?.groupKey) return
    onSetGroup(rowAxis.groupKey, () => new Set([vId]))
    if (colAxis.groupKey !== rowAxis.groupKey) onSetGroup(colAxis.groupKey, () => new Set([hId]))
  }

  const hint = mode === 'hotspot'
    ? <>Cells shaded <strong>moss</strong> have the most studies. Click a cell to filter.</>
    : <>Cells shaded <strong style={{ color: '#b45a3d' }}>clay</strong> are under-represented given the marginals. Click to isolate.</>

  return (
    <div className="w-full h-full flex flex-col">
      {/* Controls */}
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-6">
        {/* Mode toggle */}
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Mode</div>
          <div className="flex rounded border border-gray-200 overflow-hidden">
            <button
              onClick={() => setMode('hotspot')}
              className={`px-3 py-1 text-xs font-medium transition-colors ${mode === 'hotspot' ? 'bg-[#2d5238] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Hotspots
            </button>
            <button
              onClick={() => setMode('gap')}
              className={`px-3 py-1 text-xs font-medium transition-colors ${mode === 'gap' ? 'bg-[#b45a3d] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Evidence gaps
            </button>
          </div>
        </div>

        {/* Row axis */}
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Rows</div>
          <select
            className="text-xs border border-gray-200 rounded px-2 py-1"
            value={rowAxisId}
            onChange={e => setRowAxisId(e.target.value)}
          >
            {axisOptions.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
          </select>
        </div>

        <button className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 hover:bg-gray-50 mt-4" onClick={swapAxes} title="Swap axes">↔</button>

        {/* Column axis */}
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Columns</div>
          <select
            className="text-xs border border-gray-200 rounded px-2 py-1"
            value={colAxisId}
            onChange={e => setColAxisId(e.target.value)}
          >
            {axisOptions.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
          </select>
        </div>

        {/* Log scale */}
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={useLog} onChange={e => setUseLog(e.target.checked)} className="rounded" />
            Log scale
          </label>
        </div>
        <div className="text-xs text-gray-500 text-right mt-4 ml-2">{hint}</div>
      </div>

      {/* Matrix table */}
      <div className="flex-1 overflow-auto p-4">
        {/*
          paddingRight gives the last column's angled header text room beyond
          the grid edge, preventing the overflow: auto container from clipping it.
        */}
        <div className="min-w-max" style={{ paddingRight: 80 }}>
          {/* Column headers — vertical writing-mode: zero overflow risk */}
          <div className="flex" style={{ paddingLeft: 160 }}>
            {cols.map(h => (
              <div
                key={h.id}
                className="flex-shrink-0 flex items-end justify-center pb-2"
                style={{ width: 80, height: 120 }}
                title={h.name}
              >
                <span
                  className="text-[11px] font-medium text-gray-600 select-none"
                  style={{
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    maxHeight: 108,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h.name.length > 20 ? h.name.slice(0, 19) + '…' : h.name}
                </span>
              </div>
            ))}
          </div>

          {/* Data rows */}
          <div>
            {rows.map((v, rowIdx) => (
              <div key={v.id} className="flex gap-px mb-px">
                <div className="flex-shrink-0 flex items-center text-[11px] font-medium text-gray-700 pr-2 text-right" style={{ width: 158 }}>
                  {v.name}
                </div>
                {cols.map((h, colIdx) => {
                  const count = matrix[rowIdx]?.[colIdx] ?? 0
                  return (
                    <div
                      key={`${v.id}-${h.id}`}
                      className="flex-shrink-0 flex items-center justify-center text-[11px] font-semibold cursor-pointer hover:brightness-95 transition-all rounded-sm"
                      style={{
                        width: 80, height: 36,
                        backgroundColor: cellColor(count, rowIdx, colIdx),
                        color: textColor(count, rowIdx, colIdx),
                      }}
                      title={`${v.name} × ${h.name}: ${count.toLocaleString()}`}
                      onClick={() => applyCellFilters(v.id, h.id)}
                    >
                      {count > 0 ? count.toLocaleString() : ''}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6 flex items-center gap-3 text-[11px] text-gray-500">
          {mode === 'hotspot' ? (
            <>
              <span>Fewer</span>
              <div className="h-2 w-40 rounded" style={{ background: 'linear-gradient(90deg, #f9fafb, hsl(140,22%,91%), hsl(140,32%,77%), hsl(140,42%,58%), #2d5238)' }} />
              <span>More</span>
            </>
          ) : (
            <>
              <span>Well-represented</span>
              <div className="h-2 w-40 rounded" style={{ background: 'linear-gradient(90deg, #f9fafb, hsl(20,30%,94%), hsl(20,45%,82%), hsl(20,55%,68%), #b45a3d)' }} />
              <span>Under-represented</span>
            </>
          )}
          <span className="ml-2 text-gray-400">{useLog ? 'log scale · ' : ''}max {maxValue.toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}
