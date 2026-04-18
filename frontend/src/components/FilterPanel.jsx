/**
 * components/FilterPanel.jsx
 *
 * Left sidebar. Minimalist design matching reference:
 *  - Collapsible sections with chevron
 *  - Year histogram with range in header
 *  - Flat groups: list rows with colored dot + count
 *  - Hierarchical groups: search box + tree with count right-aligned
 */
import { useRef, useEffect, useMemo, useState } from 'react'
import * as Plot from '@observablehq/plot'
import { countWithinFilter, triState, toggleLabel } from '../utils/bitmask'

export default function FilterPanel({
  info, arrowData, bitmasks, activeFilters, filteredMask,
  yearRange, totalVisible, onSetGroup, onYearRange, onClear,
}) {
  if (!info) return null
  const firstGroup = Object.values(bitmasks ?? {})[0]
  const firstMask  = firstGroup && Object.values(firstGroup)[0]
  const byteLength = firstMask?.length ?? 0

  return (
    <div className="py-2">
      {/* Year histogram */}
      {arrowData && yearRange && (
        <YearSection
          arrowData={arrowData} yearRange={yearRange}
          onYearRange={onYearRange} info={info} filteredMask={filteredMask}
        />
      )}

      {/* One section per label group */}
      {Object.entries(info.groups).map(([groupKey, group]) =>
        group.type === 'hierarchical' ? (
          <HierSection
            key={groupKey} groupKey={groupKey} group={group}
            bitmasks={bitmasks} filteredMask={filteredMask}
            activeFilters={activeFilters} byteLength={byteLength}
            onSetGroup={onSetGroup}
          />
        ) : (
          <FlatSection
            key={groupKey} groupKey={groupKey} group={group}
            bitmasks={bitmasks} filteredMask={filteredMask}
            activeFilters={activeFilters} byteLength={byteLength}
            onSetGroup={onSetGroup}
          />
        )
      )}
    </div>
  )
}

// ── Year histogram section ─────────────────────────────────────────────────

function YearSection({ arrowData, yearRange, onYearRange, info, filteredMask }) {
  const containerRef = useRef(null)
  const [open, setOpen] = useState(true)
  const [minYear, maxYear] = yearRange

  const yearCounts = useMemo(() => {
    if (!arrowData) return { total: {}, filtered: {} }
    const total = {}, filtered = {}
    const hasFilter = !!filteredMask
    for (let i = 0; i < arrowData.length; i++) {
      const y = arrowData.year[i]
      total[y] = (total[y] || 0) + 1
      if (hasFilter && (filteredMask[i >> 3] & (1 << (i & 7))))
        filtered[y] = (filtered[y] || 0) + 1
    }
    return { total, filtered }
  }, [arrowData, filteredMask])

  useEffect(() => {
    if (!open || !containerRef.current) return
    const startYear = info.start_year, endYear = info.end_year - 1
    const data = []
    const hasFilter = !!filteredMask
    for (let y = startYear; y <= endYear; y++) {
      const total = yearCounts.total[y] || 0
      const filtered = hasFilter ? (yearCounts.filtered[y] || 0) : total
      data.push({ year: y, total, filtered })
    }
    const plot = Plot.plot({
      width: containerRef.current.clientWidth || 220,
      height: 64,
      marginTop: 2, marginBottom: 0, marginLeft: 0, marginRight: 0,
      x: { axis: null },
      y: { axis: null },
      marks: [
        Plot.rectY(data, { x: 'year', y: 'total',    fill: '#e5e7eb', rx: 1, insetLeft: 0.5, insetRight: 0.5 }),
        Plot.rectY(data, { x: 'year', y: 'filtered', fill: '#2d5238', rx: 1, insetLeft: 0.5, insetRight: 0.5 }),
      ],
    })
    containerRef.current.innerHTML = ''
    containerRef.current.appendChild(plot)
    return () => plot.remove?.()
  }, [yearCounts, info, filteredMask, open])

  return (
    <div className="border-b border-gray-200">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors"
      >
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Publication year</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400">{minYear}–{maxYear}</span>
          <span className="text-gray-400 text-[10px]">{open ? '▾' : '▸'}</span>
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div ref={containerRef} className="w-full" />
          <DualRangeSlider
            min={info.start_year} max={info.end_year - 1}
            low={minYear} high={maxYear}
            onChange={onYearRange}
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
            <span>{minYear}</span><span>{maxYear}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Dual range slider ──────────────────────────────────────────────────────

const RANGE_CLS = 'absolute inset-0 w-full h-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#2d5238] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#2d5238] [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer'

function DualRangeSlider({ min, max, low, high, onChange }) {
  const span = max - min
  const pct  = v => ((v - min) / span) * 100
  return (
    <div className="relative mt-2 mb-1" style={{ height: 16 }}>
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-gray-200 rounded pointer-events-none" />
      <div
        className="absolute top-1/2 -translate-y-1/2 h-0.5 bg-[#2d5238] rounded pointer-events-none"
        style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }}
      />
      <input type="range" min={min} max={max} value={low}
        onChange={e => onChange([Math.min(+e.target.value, high), high])} className={RANGE_CLS} />
      <input type="range" min={min} max={max} value={high}
        onChange={e => onChange([low, Math.max(+e.target.value, low)])} className={RANGE_CLS} />
    </div>
  )
}

// ── Shared section wrapper ─────────────────────────────────────────────────

function SectionShell({ title, description, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-200">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
      >
        <span className="text-sm text-gray-400 w-4 text-center leading-none">{open ? '▾' : '▸'}</span>
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex-1">{title}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {description && (
            <p className="text-[11px] text-gray-400 mb-2 leading-snug">{description}</p>
          )}
          {children}
        </div>
      )}
    </div>
  )
}

// ── Flat (non-hierarchical) section ───────────────────────────────────────

function FlatSection({ groupKey, group, bitmasks, filteredMask, activeFilters, byteLength, onSetGroup }) {
  const selected = activeFilters[groupKey] ?? new Set()

  return (
    <SectionShell title={group.name} description={group.description}>
      <div className="flex flex-col gap-1">
        {Object.values(group.labels).map(label => {
          const isActive = selected.has(label.id)
          const mask  = bitmasks[groupKey]?.[label.id]
          const count = mask ? countWithinFilter(filteredMask, mask, byteLength) : 0
          const [h, s, l] = label.colour ?? [210, 50, 50]
          const dotColor   = `hsl(${h},${s}%,${l}%)`

          return (
            <button
              key={label.id}
              onClick={() => onSetGroup(groupKey, set => {
                const next = new Set(set)
                if (next.has(label.id)) next.delete(label.id)
                else next.add(label.id)
                return next
              })}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs text-left transition-colors
                ${isActive
                  ? 'bg-[#e8f0ea] ring-1 ring-[#2d5238]/20'
                  : 'bg-[#f0ede8] hover:bg-[#e8e4de]'}`}
            >
              <span
                className="flex-shrink-0 w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: dotColor }}
              />
              <span className={`flex-1 ${isActive ? 'text-[#1e3827] font-semibold' : 'text-gray-700'}`}>
                {label.name}
              </span>
              <span className={`tabular-nums text-[11px] ${isActive ? 'text-[#2d5238]' : 'text-gray-400'}`}>{count.toLocaleString()}</span>
            </button>
          )
        })}
      </div>
    </SectionShell>
  )
}

// ── Hierarchical section ───────────────────────────────────────────────────

function HierSection({ groupKey, group, bitmasks, filteredMask, activeFilters, byteLength, onSetGroup }) {
  const activeSet = activeFilters[groupKey] ?? new Set()
  const [expanded, setExpanded] = useState(new Set())
  const [search, setSearch] = useState('')
  const labels = group.labels

  // Auto-expand ancestors of active labels
  useEffect(() => {
    const ancestors = id => {
      const chain = []
      let cur = id
      while (cur && labels[cur]) { chain.push(cur); cur = labels[cur].parent }
      return chain
    }
    setExpanded(prev => {
      const merged = new Set(prev)
      activeSet.forEach(id => ancestors(id).forEach(a => merged.add(a)))
      return merged
    })
  }, [activeSet, labels])

  // Labels matching search (and their ancestors for context)
  const searchLower = search.toLowerCase().trim()
  const matchingIds = useMemo(() => {
    if (!searchLower) return null
    const matched = new Set()
    for (const label of Object.values(labels)) {
      if (label.name.toLowerCase().includes(searchLower)) {
        // add label and all ancestors
        matched.add(label.id)
        let cur = labels[label.parent]
        while (cur) { matched.add(cur.id); cur = labels[cur.parent] }
      }
    }
    return matched
  }, [searchLower, labels])

  // Auto-expand matching nodes when searching
  useEffect(() => {
    if (!matchingIds) return
    setExpanded(prev => {
      const next = new Set(prev)
      matchingIds.forEach(id => next.add(id))
      return next
    })
  }, [matchingIds])

  function renderNode(label, depth = 0) {
    if (matchingIds && !matchingIds.has(label.id)) return null
    const children = (label.children || []).map(id => labels[id]).filter(Boolean)
    const state = triState(label.id, activeSet, group)
    const mask  = bitmasks[groupKey]?.[label.id]
    const count = mask ? countWithinFilter(filteredMask, mask, byteLength) : 0
    const isExpanded = expanded.has(label.id)

    const toggleExpand = e => {
      e.stopPropagation()
      setExpanded(prev => {
        const next = new Set(prev)
        if (next.has(label.id)) next.delete(label.id)
        else next.add(label.id)
        return next
      })
    }

    const isActive   = state === 'checked'
    const isPartial  = state === 'partial'

    return (
      <div key={label.id}>
        <div className="flex items-start gap-0.5 py-0.5">
          {/* Expand toggle */}
          {children.length > 0 ? (
            <button
              onClick={toggleExpand}
              className="w-5 flex-shrink-0 pt-1.5 text-[10px] text-gray-400 hover:text-gray-600 text-center font-medium transition-colors"
              style={{ lineHeight: 1 }}
            >
              {isExpanded ? '▾' : '›'}
            </button>
          ) : (
            <span className="w-5 flex-shrink-0" />
          )}

          {/* Label row */}
          <button
            onClick={() => onSetGroup(groupKey, set => toggleLabel(set, label.id, group))}
            className={`flex-1 flex items-center justify-between px-1.5 py-1 rounded text-xs text-left transition-colors leading-snug
              ${isActive  ? 'bg-[#e8f0ea] text-[#1e3827]'
              : isPartial ? 'bg-[#f3f7f4] text-[#2d5238]'
              :             'hover:bg-[#f0ede8] text-gray-700'}`}
          >
            <span className={isActive || isPartial ? 'font-semibold' : ''}>{label.name}</span>
            <span className="text-gray-400 tabular-nums text-[11px] ml-3 flex-shrink-0">{count.toLocaleString()}</span>
          </button>
        </div>

        {/* Children */}
        {children.length > 0 && isExpanded && (
          <div className="ml-5 border-l-2 border-gray-200 pl-2 mt-0.5 mb-1">
            {children.sort((a, b) => a.name.localeCompare(b.name)).map(c => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const roots = Object.values(labels).filter(l => !l.parent).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <SectionShell title={group.name} description={group.description}>
      {/* Search */}
      <div className="relative mb-2">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[11px]">⌕</span>
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-6 pr-2 py-1.5 text-xs border border-gray-200 rounded bg-white placeholder-gray-400 focus:outline-none focus:border-[#2d5238] focus:ring-1 focus:ring-[#2d5238]/20"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">×</button>
        )}
      </div>

      <div>{roots.map(r => renderNode(r))}</div>
    </SectionShell>
  )
}
