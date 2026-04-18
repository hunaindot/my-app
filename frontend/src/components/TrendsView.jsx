/**
 * components/TrendsView.jsx
 *
 * Publication-count-over-time, broken down by one label group.
 * One line per root label in the selected group, respects filteredMask.
 */
import { useMemo, useState, useRef, useEffect } from 'react'
import * as Plot from '@observablehq/plot'

export default function TrendsView({ info, arrowData, bitmasks, filteredMask }) {
  const groupOptions = useMemo(() => {
    if (!info) return []
    return Object.entries(info.groups).map(([key, group]) => ({ key, label: group.name }))
  }, [info])

  const [groupKey, setGroupKey] = useState(() => groupOptions[0]?.key ?? '')
  const containerRef = useRef(null)

  // Sync default if info loads after mount
  useEffect(() => {
    if (!groupKey && groupOptions.length > 0) setGroupKey(groupOptions[0].key)
  }, [groupOptions, groupKey])

  const rootLabels = useMemo(() => {
    if (!info || !groupKey) return []
    const group = info.groups[groupKey]
    if (!group) return []
    return Object.values(group.labels).filter(l => !l.parent)
  }, [info, groupKey])

  const { seriesData, labelMeta } = useMemo(() => {
    if (!arrowData || !bitmasks || !info || !groupKey || !rootLabels.length) return { seriesData: [], labelMeta: [] }
    const group = info.groups[groupKey]
    if (!group) return { seriesData: [], labelMeta: [] }
    const masksForGroup = bitmasks[groupKey] || {}
    const startYear = info.start_year
    const endYear = info.end_year
    const data = []
    const meta = []

    for (const label of rootLabels) {
      const mask = masksForGroup[label.id]
      if (!mask) continue
      const yearMap = {}
      for (let y = startYear; y <= endYear; y++) yearMap[y] = 0
      for (let i = 0; i < arrowData.length; i++) {
        if (filteredMask && !(filteredMask[i >> 3] & (1 << (i & 7)))) continue
        if (mask[i >> 3] & (1 << (i & 7))) {
          const yr = arrowData.year[i]
          if (yr !== undefined && yr >= startYear && yr <= endYear) yearMap[yr]++
        }
      }
      const [h, s, l] = label.colour ?? [210, 50, 50]
      const color = `hsl(${h},${s}%,${l}%)`
      for (let y = startYear; y <= endYear; y++) data.push({ year: y, count: yearMap[y], label: label.name, color })
      meta.push({ name: label.name, color })
    }
    return { seriesData: data, labelMeta: meta }
  }, [arrowData, bitmasks, info, groupKey, rootLabels, filteredMask])

  useEffect(() => {
    if (!containerRef.current) return
    const w = containerRef.current.clientWidth || 600
    const h = containerRef.current.clientHeight || 340

    if (!seriesData.length) {
      containerRef.current.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:13px">No data</div>'
      return
    }

    const labelNames = labelMeta.map(m => m.name)
    const labelColors = labelMeta.map(m => m.color)

    const plot = Plot.plot({
      width: w, height: h,
      marginLeft: 48, marginRight: 16, marginTop: 20, marginBottom: 36,
      x: { label: null, tickFormat: d => String(d), ticks: 8 },
      y: { label: 'Papers / year', grid: true, gridStroke: '#e5e7eb' },
      color: { domain: labelNames, range: labelColors },
      marks: [
        Plot.ruleY([0], { stroke: '#e5e7eb' }),
        Plot.lineY(seriesData, {
          x: 'year', y: 'count', stroke: 'label',
          strokeWidth: 2, curve: 'monotone-x',
        }),
      ],
    })

    containerRef.current.innerHTML = ''
    containerRef.current.appendChild(plot)
    return () => plot.remove?.()
  }, [seriesData, labelMeta])

  return (
    <div className="w-full h-full flex flex-col overflow-hidden" style={{ background: '#f7f6f0' }}>
      {/* Controls */}
      <div className="flex-shrink-0 px-6 pt-5 pb-3 flex items-center gap-3">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Break down by</span>
        <select
          className="text-xs border border-gray-200 rounded px-3 py-1.5 bg-white"
          value={groupKey}
          onChange={e => setGroupKey(e.target.value)}
        >
          {groupOptions.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
        </select>
      </div>

      {/* Chart + Legend side by side */}
      <div className="flex-1 flex min-h-0 px-4 pb-2">
        <div ref={containerRef} className="flex-1 min-w-0" />
        {/* Manual legend */}
        <div className="flex-shrink-0 flex flex-col justify-center gap-2 pl-4 pr-2" style={{ minWidth: 140 }}>
          {labelMeta.map(m => (
            <div key={m.name} className="flex items-center gap-2 text-xs text-gray-700">
              <span className="inline-block flex-shrink-0 rounded-sm" style={{ width: 22, height: 3, backgroundColor: m.color }} />
              <span className="leading-tight">{m.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Caption */}
      <div className="flex-shrink-0 px-6 pb-5 text-xs text-gray-500 max-w-2xl leading-relaxed">
        Each line shows publication count per year within the current query.
        The drop at the far right reflects incomplete indexing of the most recent year.
      </div>
    </div>
  )
}
