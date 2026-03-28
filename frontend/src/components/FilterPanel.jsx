/**
 * components/FilterPanel.jsx
 *
 * Left sidebar. Year histogram at top, then tag-cloud per label group.
 * All label definitions read from info.json — never hardcoded.
 */
import { useRef, useEffect, useMemo } from 'react'
import * as Plot from '@observablehq/plot'
import { countBits, countWithinFilter } from '../utils/bitmask'

export default function FilterPanel({
  info,
  arrowData,
  bitmasks,
  activeFilters,
  filteredMask,
  yearRange,
  totalVisible,
  onToggle,
  onYearRange,
  onClear,
}) {
  if (!info) return null
  const byteLength = Object.values(bitmasks)[0]?.length ?? 0
  const hasFilters = Object.keys(activeFilters).length > 0 ||
    (yearRange && (yearRange[0] > info.start_year || yearRange[1] < info.end_year))

  return (
    <div>
      {/* Record count + clear */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Filters</span>
        {hasFilters && (
          <button onClick={onClear} className="text-xs text-blue-600 hover:underline">
            Clear all
          </button>
        )}
      </div>
      <div className="text-xs text-gray-700 mb-4">
        <span className="font-semibold">{totalVisible.toLocaleString()}</span>
        {' / '}
        {(arrowData?.length ?? info.total).toLocaleString()} documents
      </div>

      {/* Year histogram */}
      {arrowData && yearRange && (
        <YearHistogram
          arrowData={arrowData}
          yearRange={yearRange}
          onYearRange={onYearRange}
          info={info}
        />
      )}

      {/* One tag-cloud section per label group */}
      {Object.entries(info.groups).map(([groupKey, group]) => (
        <FilterGroup
          key={groupKey}
          groupKey={groupKey}
          group={group}
          bitmasks={bitmasks}
          filteredMask={filteredMask}
          activeFilters={activeFilters}
          byteLength={byteLength}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}

function YearHistogram({ arrowData, yearRange, onYearRange, info }) {
  const containerRef = useRef(null)
  const [minYear, maxYear] = yearRange

  // Count documents per year from arrowData
  const yearCounts = useMemo(() => {
    if (!arrowData) return {}
    const counts = {}
    for (let i = 0; i < arrowData.length; i++) {
      const y = arrowData.year[i]
      counts[y] = (counts[y] || 0) + 1
    }
    return counts
  }, [arrowData])

  // Render bar chart with Plot
  useEffect(() => {
    if (!containerRef.current) return
    const startYear = info.start_year
    const endYear = info.end_year
    const data = []
    for (let y = startYear; y <= endYear; y++) {
      data.push({ year: y, count: yearCounts[y] || 0, selected: y >= minYear && y <= maxYear })
    }
    const plot = Plot.plot({
      width: containerRef.current.clientWidth || 220,
      height: 56,
      marginTop: 4,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      x: { axis: null },
      y: { axis: null },
      marks: [
        Plot.rectY(data, {
          x: 'year',
          y: 'count',
          fill: d => d.selected ? '#92400e' : '#e5e7eb',
          rx: 1,
          insetLeft: 0.5,
          insetRight: 0.5,
        }),
      ],
    })
    containerRef.current.innerHTML = ''
    containerRef.current.appendChild(plot)
    return () => plot.remove?.()
  }, [yearCounts, minYear, maxYear, info])

  return (
    <div className="mb-5">
      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
        Publication year
      </div>
      <div ref={containerRef} className="w-full" />
      <div className="flex gap-1 mt-1">
        <input
          type="range"
          min={info.start_year}
          max={info.end_year}
          value={minYear}
          onChange={e => onYearRange([+e.target.value, maxYear])}
          className="flex-1 accent-amber-700 h-1"
        />
        <input
          type="range"
          min={info.start_year}
          max={info.end_year}
          value={maxYear}
          onChange={e => onYearRange([minYear, +e.target.value])}
          className="flex-1 accent-amber-700 h-1"
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
        <span>{minYear}</span>
        <span>{maxYear}</span>
      </div>
    </div>
  )
}

function FilterGroup({ groupKey, group, bitmasks, filteredMask, activeFilters, byteLength, onToggle }) {
  const selected = activeFilters[groupKey] ?? new Set()

  return (
    <div className="mb-5">
      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
        {group.name}
      </div>
      <div className="flex flex-wrap gap-1">
        {Object.entries(group.labels).map(([labelKey, label]) => {
          const idx = parseInt(labelKey.split('|')[1])
          const isActive = selected.has(idx)
          const mask = bitmasks[labelKey]
          const count = mask ? countWithinFilter(filteredMask, mask, byteLength) : 0

          const [h, s, l] = label.colour ?? [210, 50, 50]
          const bg = isActive ? `hsl(${h},${s}%,${l}%)` : `hsl(${h},${s}%,94%)`
          const fg = isActive ? 'white' : `hsl(${h},${s}%,30%)`

          return (
            <button
              key={labelKey}
              onClick={() => onToggle(groupKey, idx)}
              style={{ backgroundColor: bg, color: fg }}
              className="text-xs px-2 py-0.5 rounded-full border border-transparent
                         hover:opacity-80 transition-opacity flex items-center gap-1"
            >
              <span>{label.name}</span>
              <span className="opacity-70 text-[10px]">{count.toLocaleString()}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
