/**
 * components/FilterPanel.jsx
 *
 * Left sidebar. Year histogram at top, then tag-cloud per label group.
 * All label definitions read from info.json — never hardcoded.
 */
import { useRef, useEffect, useMemo, useState } from 'react'
import * as Plot from '@observablehq/plot'
import { countWithinFilter, triState, toggleLabel } from '../utils/bitmask'

export default function FilterPanel({
  info,
  arrowData,
  bitmasks,
  activeFilters,
  filteredMask,
  yearRange,
  totalVisible,
  onSetGroup,
  onYearRange,
  onClear,
}) {
  if (!info) return null
  const firstGroup = Object.values(bitmasks ?? {})[0]
  const firstMask = firstGroup && Object.values(firstGroup)[0]
  const byteLength = firstMask?.length ?? 0
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
      {Object.entries(info.groups).map(([groupKey, group]) =>
        group.type === 'hierarchical' ? (
          <HierGroup
            key={groupKey}
            groupKey={groupKey}
            group={group}
            bitmasks={bitmasks}
            filteredMask={filteredMask}
            activeFilters={activeFilters}
            byteLength={byteLength}
            onSetGroup={onSetGroup}
          />
        ) : (
          <FilterGroup
            key={groupKey}
            groupKey={groupKey}
            group={group}
            bitmasks={bitmasks}
            filteredMask={filteredMask}
            activeFilters={activeFilters}
            byteLength={byteLength}
            onSetGroup={onSetGroup}
          />
        )
      )}
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
      <DualRangeSlider
        min={info.start_year} max={info.end_year}
        low={minYear} high={maxYear}
        onChange={onYearRange}
      />
      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
        <span>{minYear}</span>
        <span>{maxYear}</span>
      </div>
    </div>
  )
}

// Tailwind classes for both range inputs — defined once at module level
const RANGE_CLS = 'absolute inset-0 w-full h-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-700 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-amber-700 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer'

function DualRangeSlider({ min, max, low, high, onChange }) {
  const span = max - min
  const pct  = v => ((v - min) / span) * 100
  return (
    <div className="relative mt-2 mb-1" style={{ height: 16 }}>
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-gray-200 rounded pointer-events-none" />
      <div
        className="absolute top-1/2 -translate-y-1/2 h-1 bg-amber-700 rounded pointer-events-none"
        style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }}
      />
      <input type="range" min={min} max={max} value={low}
        onChange={e => onChange([Math.min(+e.target.value, high), high])}
        className={RANGE_CLS}
      />
      <input type="range" min={min} max={max} value={high}
        onChange={e => onChange([low, Math.max(+e.target.value, low)])}
        className={RANGE_CLS}
      />
    </div>
  )
}

function FilterGroup({ groupKey, group, bitmasks, filteredMask, activeFilters, byteLength, onSetGroup }) {
  const selected = activeFilters[groupKey] ?? new Set()

  return (
    <div className="mb-5">
      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
        {group.name}
      </div>
      <div className="flex flex-wrap gap-1">
        {Object.values(group.labels).map(label => {
          const isActive = selected.has(label.id)
          const mask = bitmasks[groupKey]?.[label.id]
          const count = mask ? countWithinFilter(filteredMask, mask, byteLength) : 0

          const [h, s, l] = label.colour ?? [210, 50, 50]
          const bg = isActive ? `hsl(${h},${s}%,${l}%)` : `hsl(${h},${s}%,94%)`
          const fg = isActive ? 'white' : `hsl(${h},${s}%,30%)`

          return (
            <button
              key={label.id}
              onClick={() => onSetGroup(groupKey, set => {
                const next = new Set(set)
                if (next.has(label.id)) next.delete(label.id)
                else next.add(label.id)
                return next
              })}
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

function HierGroup({ groupKey, group, bitmasks, filteredMask, activeFilters, byteLength, onSetGroup }) {
  const activeSet = activeFilters[groupKey] ?? new Set()
  const [expanded, setExpanded] = useState(new Set())

  const labels = group.labels

  // Auto-expand ancestors of active labels so users can see their context,
  // but keep everything else collapsed by default. Preserve any manual
  // expand/collapse the user does.
  useEffect(() => {
    const next = new Set()
    const ancestors = (id) => {
      const chain = []
      let cur = id
      while (cur && labels[cur]) {
        chain.push(cur)
        cur = labels[cur].parent
      }
      return chain
    }
    activeSet.forEach(id => ancestors(id).forEach(a => next.add(a)))
    setExpanded(prev => {
      const merged = new Set(prev)
      next.forEach(a => merged.add(a))
      return merged
    })
  }, [activeSet, labels])

  function renderNode(label) {
    const children = (label.children || []).map(id => labels[id]).filter(Boolean)
    const state = triState(label.id, activeSet, group)
    const mask = bitmasks[groupKey]?.[label.id]
    const count = mask ? countWithinFilter(filteredMask, mask, byteLength) : 0
    const isExpanded = expanded.has(label.id)

    const toggleExpand = () => {
      setExpanded(prev => {
        const next = new Set(prev)
        if (next.has(label.id)) next.delete(label.id)
        else next.add(label.id)
        return next
      })
    }

    return (
      <div key={label.id} className="mb-1">
        <div className="flex items-center gap-1 text-xs">
          {children.length > 0 ? (
            <button
              onClick={toggleExpand}
              className="w-4 text-gray-400 hover:text-gray-700"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? '▾' : '▸'}
            </button>
          ) : (
            <span className="w-4" />
          )}

          <button
            onClick={() => onSetGroup(groupKey, set => toggleLabel(set, label.id, group))}
            className={`flex-1 text-left px-2 py-1 rounded transition-colors
              ${state === 'checked' ? 'bg-amber-700 text-white'
                : state === 'partial' ? 'bg-amber-100 text-amber-900'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
            style={{ borderLeft: `3px solid hsl(${(label.colour||[30,50,50])[0]}, ${(label.colour||[30,50,50])[1]}%, ${(label.colour||[30,50,50])[2]}%)` }}
          >
            <span>{label.name}</span>
            <span className="ml-2 text-[10px] opacity-70">{count.toLocaleString()}</span>
          </button>
        </div>

        {children.length > 0 && isExpanded && (
          <div className="ml-5 mt-1 border-l border-gray-100 pl-2">
            {children.sort((a, b) => a.name.localeCompare(b.name)).map(renderNode)}
          </div>
        )}
      </div>
    )
  }

  const roots = Object.values(labels).filter(l => !l.parent).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="mb-5">
      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 flex items-center justify-between">
        <span>{group.name}</span>
      </div>
      <div>
        {roots.map(renderNode)}
      </div>
    </div>
  )
}
