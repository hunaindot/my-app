import { useMemo, useState, useEffect } from 'react'
import { countIntersection } from '../utils/bitmask'

function levelLabelsForGroup(groupKey, level) {
  if (groupKey === 'realm') {
    return { 0: 'Realm', 1: 'Biome', 2: 'EFG' }[level] || `Level ${level}`
  }
  if (groupKey === 'region') {
    return { 0: 'Region', 1: 'Subregion', 2: 'Country / sub-national' }[level] || `Level ${level}`
  }
  if (groupKey === 'threats') {
    return { 0: 'Threat category', 1: 'Sub-category' }[level] || `Level ${level}`
  }
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
        out.push({
          id: `${groupKey}|${level}`,
          groupKey,
          level,
          label: `${group.name} · ${levelLabelsForGroup(groupKey, level)}`,
        })
      }
      out.push({
        id: `${groupKey}|all`,
        groupKey,
        level: null,
        label: `${group.name} · All levels`,
      })
    } else {
      out.push({
        id: `${groupKey}|all`,
        groupKey,
        level: null,
        label: group.name,
      })
    }
  }
  return out
}

export default function MatrixView({ info, bitmasks, filteredMask, activeFilters, onSetGroup }) {
  const axisOptions = useMemo(() => buildAxisOptions(info), [info])
  const defaultV = axisOptions.find(o => o.id === 'region|1')?.id ?? axisOptions[0]?.id ?? ''
  const defaultH = axisOptions.find(o => o.id === 'threats|0')?.id ?? axisOptions[1]?.id ?? defaultV
  const [verticalAxisId, setVerticalAxisId] = useState(defaultV)
  const [horizontalAxisId, setHorizontalAxisId] = useState(defaultH)
  const [useLog, setUseLog] = useState(true)

  useEffect(() => {
    if (!info || axisOptions.length === 0) return
    const validIds = new Set(axisOptions.map(o => o.id))
    if (!validIds.has(verticalAxisId)) setVerticalAxisId(defaultV)
    if (!validIds.has(horizontalAxisId)) setHorizontalAxisId(defaultH)
  }, [info, axisOptions, defaultV, defaultH, verticalAxisId, horizontalAxisId])

  const verticalAxis = axisOptions.find(o => o.id === verticalAxisId)
  const horizontalAxis = axisOptions.find(o => o.id === horizontalAxisId)

  const verticalGroup = info?.groups?.[verticalAxis?.groupKey]
  const horizontalGroup = info?.groups?.[horizontalAxis?.groupKey]

  function isAncestor(ancestorId, nodeId, labels) {
    let cur = labels?.[nodeId]
    while (cur?.parent) {
      if (cur.parent === ancestorId) return true
      cur = labels[cur.parent]
    }
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

  const vLabels = useMemo(() => {
    if (!verticalGroup) return []
    const labels = Object.values(verticalGroup.labels || {})
    const filtered = verticalAxis?.level == null ? labels : labels.filter(l => (l.level ?? 0) === verticalAxis.level)
    return filtered
      .filter(l => withinSelectedTree(l, verticalAxis.groupKey, verticalGroup.labels))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [verticalGroup, verticalAxis, activeFilters])

  const hLabels = useMemo(() => {
    if (!horizontalGroup) return []
    const labels = Object.values(horizontalGroup.labels || {})
    const filtered = horizontalAxis?.level == null ? labels : labels.filter(l => (l.level ?? 0) === horizontalAxis.level)
    return filtered
      .filter(l => withinSelectedTree(l, horizontalAxis.groupKey, horizontalGroup.labels))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [horizontalGroup, horizontalAxis, activeFilters])

  const byteLength = useMemo(() => {
    const masksForGroup = bitmasks?.[verticalAxis?.groupKey] || bitmasks?.[horizontalAxis?.groupKey]
    const first = masksForGroup && Object.values(masksForGroup)[0]
    return first?.length ?? 0
  }, [bitmasks, verticalAxis, horizontalAxis])

  const { matrix, maxValue, rows, cols } = useMemo(() => {
    if (!bitmasks || !verticalGroup || !horizontalGroup) return { matrix: [], maxValue: 0 }
    const vMasks = bitmasks[verticalAxis.groupKey] || {}
    const hMasks = bitmasks[horizontalAxis.groupKey] || {}
    const filt = filteredMask || null
    let max = 0
    const rawRows = vLabels.map(v => {
      const row = hLabels.map(h => {
        const count = countIntersection(vMasks[v.id], hMasks[h.id], filt, byteLength)
        if (count > max) max = count
        return count
      })
      return row
    })
    const rowHasValue = rawRows.map(r => r.some(v => v > 0))
    const colHasValue = hLabels.map((_, c) => rawRows.some(r => r[c] > 0))
    const rows = vLabels.filter((_, i) => rowHasValue[i])
    const cols = hLabels.filter((_, i) => colHasValue[i])
    const matrix = rawRows
      .filter((_, i) => rowHasValue[i])
      .map(r => r.filter((_, i) => colHasValue[i]))
    return { matrix, maxValue: max, rows, cols }
  }, [bitmasks, verticalGroup, horizontalGroup, vLabels, hLabels, filteredMask, byteLength, verticalAxis, horizontalAxis])

  const maxScaleValue = useLog ? Math.log10(maxValue + 1) : maxValue

  function valueToColor(value) {
    if (maxScaleValue <= 0) return '#f3f4f6'
    const v = useLog ? Math.log10(value + 1) : value
    const t = Math.min(1, Math.max(0, v / maxScaleValue))
    if (t < 0.2) return '#ffffff'
    if (t < 0.4) return 'hsl(210,30%,90%)'
    if (t < 0.6) return 'hsl(210,40%,78%)'
    if (t < 0.8) return 'hsl(210,55%,62%)'
    return 'hsl(216,65%,40%)'
  }

  function textColor(value) {
    const v = useLog ? Math.log10(value + 1) : value
    const t = maxScaleValue > 0 ? v / maxScaleValue : 0
    if (t >= 0.8) return '#ffffff'
    return '#111827'
  }

  function swapAxes() {
    setVerticalAxisId(horizontalAxisId)
    setHorizontalAxisId(verticalAxisId)
  }

  function applyCellFilters(vId, hId) {
    if (!onSetGroup || !verticalAxis?.groupKey || !horizontalAxis?.groupKey) return
    onSetGroup(verticalAxis.groupKey, () => new Set([vId]))
    if (horizontalAxis.groupKey !== verticalAxis.groupKey) {
      onSetGroup(horizontalAxis.groupKey, () => new Set([hId]))
    }
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={useLog} onChange={e => setUseLog(e.target.checked)} />
            Use log-scale
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Vertical axis</span>
            <select
              className="text-xs border border-gray-200 rounded px-2 py-1"
              value={verticalAxisId}
              onChange={e => setVerticalAxisId(e.target.value)}
            >
              {axisOptions.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>
          <button
            className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 hover:bg-gray-50"
            onClick={swapAxes}
            title="Swap axes"
          >
            ↔
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Horizontal axis</span>
            <select
              className="text-xs border border-gray-200 rounded px-2 py-1"
              value={horizontalAxisId}
              onChange={e => setHorizontalAxisId(e.target.value)}
            >
              {axisOptions.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 relative">
        <div className="min-w-max">
          <div
            className="grid gap-px bg-gray-200 sticky top-0 z-30"
            style={{ gridTemplateColumns: `minmax(140px, 200px) repeat(${cols.length}, 84px)` }}
          >
          <div className="bg-white" />
          {cols.map(h => (
            <div
              key={h.id}
              className="bg-white text-[11px] font-medium text-gray-700 p-1.5 break-words"
            >
                {h.name}
              </div>
            ))}
          </div>

          <div
            className="grid gap-px bg-gray-200"
            style={{ gridTemplateColumns: `minmax(140px, 200px) repeat(${cols.length}, 84px)` }}
          >
            {rows.map((v, rowIdx) => (
              <div key={v.id} className="contents">
                <div
                  key={`${v.id}-label`}
                  className="bg-white text-[11px] font-medium text-gray-700 p-1.5 break-words sticky left-0 z-20"
                >
                  {v.name}
                </div>
                {cols.map((h, colIdx) => {
                  const count = matrix[rowIdx]?.[colIdx] ?? 0
                  return (
                    <div
                      key={`${v.id}-${h.id}`}
                      className="bg-white text-center text-[11px] font-semibold flex items-center justify-center h-9 cursor-pointer hover:brightness-95"
                      style={{ backgroundColor: valueToColor(count), color: textColor(count) }}
                      title={`${v.name} × ${h.name}: ${count.toLocaleString()}`}
                      onClick={() => applyCellFilters(v.id, h.id)}
                    >
                      {count.toLocaleString()}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3 text-[11px] text-gray-500">
          <span>Low</span>
          <div
            className="h-2 w-40 rounded"
            style={{ background: 'linear-gradient(90deg, #ffffff 0%, #ffffff 20%, hsl(210,30%,90%) 20%, hsl(210,30%,90%) 40%, hsl(210,40%,78%) 40%, hsl(210,40%,78%) 60%, hsl(210,55%,62%) 60%, hsl(210,55%,62%) 80%, hsl(216,65%,40%) 80%, hsl(216,65%,40%) 100%)' }}
          />
          <span>High</span>
          <span className="relative group ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-300 text-[10px] text-gray-500">
            i
            <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 w-64 -translate-x-1/2 rounded bg-gray-900 px-2 py-1 text-[10px] text-white opacity-0 shadow transition-opacity group-hover:opacity-100">
              Each matrix entry represents the count records in the dataset; Color scale is split in increments of 20 percentiles.
            </span>
          </span>
          <span className="ml-2 text-gray-400">
            {useLog ? 'log scale' : 'linear'} · max {maxValue.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  )
}
