/**
 * AlluvialView.jsx — Generic 3-level alluvial (Sankey-style) diagram.
 * Used by GetView (realm→biome→EFG) and ThreatsView (L0→L1→L2).
 *
 * Props:
 *   groupKey      — key into info.groups, e.g. 'realm' or 'threats'
 *   columnLabels  — ['Col A', 'Col B', 'Col C'] for the three header labels
 *   info, bitmasks, filteredMask, activeFilters, onLabelClick
 */
import { useMemo, useState } from 'react'

const NODE_W  = 14
const GAP     = 5   // gap between bars
const LABEL_P = 6
const TOP_PAD = 28
const MIN_H   = 13  // tall enough that 9px label never overlaps neighbour
const SVG_W   = 1300

const COL_X = { l0: 270, l1: 520, l2: 840 }

const HUES = [210, 40, 145, 280, 20, 175, 330, 90, 255, 60, 5, 120]

// Built once at module load — reused by every buildLayout call
const POPCOUNT = (() => {
  const t = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    let x = i, s = 0; while (x) { s += x & 1; x >>= 1 } t[i] = s
  }
  return t
})()

export default function AlluvialView({
  groupKey,
  columnLabels = ['L0', 'L1', 'L2'],
  info,
  bitmasks,
  filteredMask,
  activeFilters,
  onLabelClick,
}) {
  const [hoveredId, setHoveredId] = useState(null)

  const numLevels = columnLabels.length  // 2 or 3
  const layout = useMemo(
    () => buildLayout(groupKey, numLevels, info, bitmasks, filteredMask),
    [groupKey, numLevels, info, bitmasks, filteredMask]
  )

  if (!layout) {
    return <div className="p-4 text-sm text-gray-500">Data unavailable.</div>
  }
  if (!layout.nodes.length) {
    return <div className="p-4 text-sm text-gray-500">No data matches current filters.</div>
  }

  const selected = activeFilters?.[groupKey] ?? new Set()
  const svgH = layout.height + TOP_PAD + 12

  const relatedToHover = hoveredId
    ? new Set([
        hoveredId,
        ...layout.flows
          .filter(f => f.srcId === hoveredId || f.tgtId === hoveredId)
          .flatMap(f => [f.srcId, f.tgtId]),
      ])
    : null

  const nodeOpacity = id => relatedToHover ? (relatedToHover.has(id) ? 1 : 0.25) : 1
  const flowOpacity = f  => relatedToHover
    ? (relatedToHover.has(f.srcId) && relatedToHover.has(f.tgtId) ? 0.65 : 0.08)
    : 0.38

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 flex-shrink-0">
        <span className="text-sm font-semibold text-gray-800">
          {columnLabels.join(' → ')}
        </span>
        <span className="text-xs text-gray-500">counts respect current filters — click to filter results</span>
      </div>

      <div className="flex-1 overflow-auto p-3">
        <svg
          viewBox={`0 0 ${SVG_W} ${svgH}`}
          width={SVG_W}
          height={svgH}
          style={{ display: 'block', minWidth: SVG_W }}
          onMouseLeave={() => setHoveredId(null)}
        >
          {/* Column headers */}
          {(['l0', 'l1', 'l2'].slice(0, numLevels)).map((col, i) => (
            <text key={col} x={COL_X[col] + NODE_W / 2} y={16}
              textAnchor="middle" fontSize={11} fontWeight="600" fill="#6b7280">
              {columnLabels[i]}
            </text>
          ))}

          {/* Flow bands */}
          {layout.flows.map((f, i) => (
            <path
              key={i}
              d={f.d}
              fill={f.color}
              fillOpacity={flowOpacity(f)}
              style={{ cursor: 'pointer', transition: 'fill-opacity 0.15s' }}
              onMouseEnter={() => setHoveredId(f.tgtId)}
              onClick={() => onLabelClick?.(groupKey, f.tgtId)}
            />
          ))}

          {/* Bars + labels */}
          {layout.nodes.map(n => {
            const bx = COL_X[n.col]
            const by = n.y + TOP_PAD
            const isLeft   = n.col === 'l0'
            const labelX   = isLeft ? bx - LABEL_P : bx + NODE_W + LABEL_P
            const anchor   = isLeft ? 'end' : 'start'
            const fontSize = n.col === 'l0' ? 10.5 : n.col === 'l1' ? 9 : 8
            const isSelected = selected.has(n.id)
            return (
              <g
                key={n.id}
                style={{ cursor: 'pointer' }}
                opacity={nodeOpacity(n.id)}
                onMouseEnter={() => setHoveredId(n.id)}
                onClick={() => onLabelClick?.(groupKey, n.id)}
              >
                <rect
                  x={bx} y={by} width={NODE_W} height={n.h}
                  fill={n.color} rx={1.5}
                  stroke={isSelected ? '#1f2937' : 'none'}
                  strokeWidth={isSelected ? 1.5 : 0}
                />
                <text
                  x={labelX} y={by + n.h / 2}
                  textAnchor={anchor} dominantBaseline="middle"
                  fontSize={fontSize}
                  fontWeight={isSelected ? '600' : 'normal'}
                  fill={isSelected ? '#111827' : '#374151'}
                >
                  {n.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Layout builder
// ---------------------------------------------------------------------------

function buildLayout(groupKey, numLevels = 3, info, bitmasks, filteredMask) {
  const group = info?.groups?.[groupKey]
  if (!group || !bitmasks?.[groupKey]) return null

  const labels = group.labels
  const masks  = bitmasks[groupKey]
  const pop    = POPCOUNT

  function countOne(id) {
    const m = masks[id]
    if (!m) return 0
    return filteredMask ? popcountAnd(m, filteredMask, pop) : popcount(m, pop)
  }

  function countTwo(id1, id2) {
    const m1 = masks[id1], m2 = masks[id2]
    if (!m1 || !m2) return 0
    return filteredMask
      ? popcountTriple(m1, m2, filteredMask, pop)
      : popcountAnd(m1, m2, pop)
  }

  const grandTotal = filteredMask ? popcount(filteredMask, pop) : (info.total ?? 1)

  // Partition labels by level (0, 1, 2)
  const byLevel = [[], [], []]
  for (const l of Object.values(labels)) {
    if (l.level != null && l.level <= 2) byLevel[l.level].push(l)
  }

  function scored(list) {
    return list
      .map(l => ({ ...l, count: countOne(l.id) }))
      .filter(l => l.count > 0)
      .sort((a, b) => b.count - a.count)
  }

  const l0nodes = scored(byLevel[0])
  const l1nodes = scored(byLevel[1])
  const l2nodes = scored(byLevel[2])

  if (!l0nodes.length && !l1nodes.length && !l2nodes.length) {
    return { nodes: [], flows: [], height: 0 }
  }

  // L0 gets colours from info.json; L1/L2 inherit from their L0 ancestor
  const l0ColorById = {}
  l0nodes.forEach((r, i) => {
    l0ColorById[r.id] = r.colour
      ? `hsl(${r.colour[0]},${r.colour[1]}%,${r.colour[2]}%)`
      : `hsl(${HUES[i % HUES.length]},52%,50%)`
  })

  function colorFor(label) {
    if (label.level === 0) return l0ColorById[label.id] ?? '#9ca3af'
    let cur = label
    while (cur?.parent) {
      if (l0ColorById[cur.parent]) return l0ColorById[cur.parent]
      cur = labels[cur.parent]
    }
    return '#9ca3af'
  }

  const colKeys   = ['l0', 'l1', 'l2'].slice(0, numLevels)
  const allLevels = [l0nodes, l1nodes, l2nodes].slice(0, numLevels)
  const maxCount  = Math.max(...allLevels.map(l => l.length))
  // Base height: give each node at least 18px slot; clamped to 380 minimum
  const HEIGHT    = Math.max(380, maxCount * 18 + (maxCount - 1) * GAP)

  // layoutCol returns { nodes, usedHeight } so SVG can size itself exactly
  function layoutCol(list, col) {
    const total = list.reduce((s, l) => s + l.count, 0)
    const scale = total > 0 ? (HEIGHT - GAP * Math.max(0, list.length - 1)) / total : 1
    let y = 0
    const nodes = list.map(l => {
      const h   = Math.max(MIN_H, l.count * scale)
      const pct = grandTotal > 0 ? (l.count / grandTotal) * 100 : 0
      const node = {
        id:    l.id,
        col,
        count: l.count,
        color: colorFor(l),
        y,
        h,
        label: makeLabel(l, col, pct),
      }
      y += h + GAP
      return node
    })
    return { nodes, usedHeight: y - GAP }
  }

  const cols = colKeys.map((col, i) => layoutCol(allLevels[i], col))
  // SVG height driven by the tallest column (MIN_H clamping may exceed HEIGHT)
  const actualHeight = Math.max(...cols.map(c => c.usedHeight))

  // Flow bands
  const flows = []

  function computeFlows(srcNodes, tgtNodes) {
    const edges = []
    for (const src of srcNodes) {
      for (const tgt of tgtNodes) {
        const v = countTwo(src.id, tgt.id)
        if (v > 0) edges.push({ src, tgt, v })
      }
    }
    if (!edges.length) return

    const bySrc = {}
    for (const e of edges) {
      ;(bySrc[e.src.id] = bySrc[e.src.id] || []).push(e)
    }
    for (const list of Object.values(bySrc)) {
      list.sort((a, b) => a.tgt.y - b.tgt.y)
    }

    const srcCursor = {}
    const tgtCursor = {}
    srcNodes.forEach(n => { srcCursor[n.id] = n.y + TOP_PAD })
    tgtNodes.forEach(n => { tgtCursor[n.id] = n.y + TOP_PAD })

    for (const src of srcNodes) {
      for (const e of bySrc[src.id] || []) {
        const srcBandH = (e.v / e.src.count) * e.src.h
        const tgtBandH = (e.v / e.tgt.count) * e.tgt.h

        const x1 = COL_X[e.src.col] + NODE_W
        const x2 = COL_X[e.tgt.col]
        const mx = (x1 + x2) / 2

        const sy0 = srcCursor[e.src.id]
        const sy1 = sy0 + srcBandH
        srcCursor[e.src.id] = sy1

        const ty0 = tgtCursor[e.tgt.id]
        const ty1 = ty0 + tgtBandH
        tgtCursor[e.tgt.id] = ty1

        const d = `M${x1},${sy0} C${mx},${sy0} ${mx},${ty0} ${x2},${ty0} L${x2},${ty1} C${mx},${ty1} ${mx},${sy1} ${x1},${sy1} Z`
        flows.push({ d, color: e.src.color, srcId: e.src.id, tgtId: e.tgt.id })
      }
    }
  }

  computeFlows(cols[0].nodes, cols[1].nodes)
  if (numLevels > 2) computeFlows(cols[1].nodes, cols[2].nodes)

  return {
    nodes: cols.flatMap(c => c.nodes),
    flows,
    height: actualHeight,
  }
}

function makeLabel(l, col, pct) {
  let pctStr
  if (pct === 0)        pctStr = '(0%)'
  else if (pct < 0.01) pctStr = '(<0.01%)'
  else if (pct < 1)    pctStr = `(${pct.toFixed(2)}%)`
  else                 pctStr = `(${Math.round(pct)}%)`

  const n = l.name ?? l.id
  if (col === 'l0') {
    const name = n.length > 38 ? n.slice(0, 36) + '…' : n
    return `${pctStr} ${name}`
  }
  if (col === 'l1') {
    const name = n.length > 44 ? n.slice(0, 42) + '…' : n
    return `${pctStr} ${name}`
  }
  const short = n.length > 42 ? n.slice(0, 40) + '…' : n
  return `${pctStr} ${l.id} ${short}`
}

// ---------------------------------------------------------------------------
// Bit counting helpers
// ---------------------------------------------------------------------------

function popcount(buf, t) {
  let n = 0; for (const b of buf) n += t[b]; return n
}
function popcountAnd(a, b, t) {
  let n = 0; for (let i = 0; i < a.length; i++) n += t[a[i] & b[i]]; return n
}
function popcountTriple(a, b, c, t) {
  let n = 0; for (let i = 0; i < a.length; i++) n += t[a[i] & b[i] & c[i]]; return n
}
