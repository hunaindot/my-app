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
  const [expanded, setExpanded] = useState(new Set(Object.values(group.labels).filter(l => !l.parent).map(l => l.id)))

  const labels = group.labels

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
