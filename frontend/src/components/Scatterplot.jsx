/**
 * components/Scatterplot.jsx
 *
 * UMAP scatterplot with:
 *  - Drag to lasso-select (default); pan mode via button
 *  - Color-by selector: drivers / realm / threats
 *  - Hover tooltip showing title + year
 *  - Bottom marginal histogram (x-axis distribution)
 *  - Zoom with scroll wheel / +− buttons
 */
import { useEffect, useRef, useMemo, useState } from 'react'
import * as Plot from '@observablehq/plot'
import { getIndices } from '../utils/bitmask'

const COLOR_GROUPS = [
  { key: 'drivers',  label: 'Drivers' },
  { key: 'realm',    label: 'Realm' },
  { key: 'threats',  label: 'IUCN threats' },
]

export default function Scatterplot({ arrowData, filteredMask, bitmasks, info, selection, onSelect }) {
  const wrapperRef   = useRef(null)
  const containerRef = useRef(null)
  const xHistRef     = useRef(null)
  const plotRef      = useRef(null)
  const dragStart    = useRef(null)
  const isDragging   = useRef(false)
  const lastHoverPos = useRef(null)

  const [brush,      setBrush]      = useState(null)
  const [xDomain,    setXDomain]    = useState(null)
  const [yDomain,    setYDomain]    = useState(null)
  const [panMode,    setPanMode]    = useState(false)
  const [colorGroup, setColorGroup] = useState('drivers')
  const [hovered,    setHovered]    = useState(null)

  const PAN_SENSITIVITY  = 0.65
  const ZOOM_SENSITIVITY = 0.0015

  const dataExtent = useMemo(() => {
    if (!arrowData) return null
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity
    for (let i = 0; i < arrowData.length; i++) {
      const x = arrowData.umap_x[i], y = arrowData.umap_y[i]
      if (x < xMin) xMin = x; if (x > xMax) xMax = x
      if (y < yMin) yMin = y; if (y > yMax) yMax = y
    }
    return { xMin, xMax, yMin, yMax, xSpan: xMax - xMin, ySpan: yMax - yMin }
  }, [arrowData])

  // Per-record color for the active color group (roots only for hierarchical)
  const pointColors = useMemo(() => {
    if (!arrowData || !bitmasks || !info) return null
    const group = info.groups[colorGroup]
    if (!group) return null
    const n = arrowData.length
    const colors = new Array(n).fill(null)
    const masksForGroup = bitmasks[colorGroup] || {}
    const roots = Object.values(group.labels).filter(l => !l.parent)
    for (const label of roots) {
      const mask = masksForGroup[label.id]
      if (!mask) continue
      const [h, s, l] = label.colour ?? [210, 50, 50]
      const colorStr = `hsl(${h},${s}%,${l}%)`
      for (let i = 0; i < n; i++) {
        if (colors[i] === null && (mask[i >> 3] & (1 << (i & 7)))) colors[i] = colorStr
      }
    }
    return colors
  }, [arrowData, bitmasks, info, colorGroup])

  // Centroid labels for the active color group
  const labelCentroids = useMemo(() => {
    if (!arrowData || !bitmasks || !info) return []
    const group = info.groups[colorGroup]
    if (!group) return []
    const n = arrowData.length
    const masksForGroup = bitmasks[colorGroup] || {}
    const roots = Object.values(group.labels).filter(l => !l.parent)
    return roots.flatMap(label => {
      const mask = masksForGroup[label.id]
      if (!mask) return []
      let sumX = 0, sumY = 0, count = 0
      for (let i = 0; i < n; i++) {
        if (mask[i >> 3] & (1 << (i & 7))) { sumX += arrowData.umap_x[i]; sumY += arrowData.umap_y[i]; count++ }
      }
      if (count < 10) return []
      const [h, s, l] = label.colour ?? [210, 50, 50]
      return [{ x: sumX / count, y: sumY / count, text: label.name, fill: `hsl(${h},${s}%,${Math.max(l - 20, 10)}%)` }]
    })
  }, [arrowData, bitmasks, info, colorGroup])

  // Main scatter plot
  useEffect(() => {
    if (!arrowData || !containerRef.current) return
    const w = containerRef.current.clientWidth
    const h = containerRef.current.clientHeight
    const n = arrowData.length

    const inFilter = new Uint8Array(n)
    if (filteredMask) { const idx = getIndices(filteredMask); for (const i of idx) inFilter[i] = 1 }
    else inFilter.fill(1)

    const selectedSet  = selection ? new Set(Array.from(selection)) : null
    const hasSelection = selectedSet && selectedSet.size > 0

    const bg = [], fg = [], sel = []
    for (let i = 0; i < n; i++) {
      const pt = { x: arrowData.umap_x[i], y: arrowData.umap_y[i] }
      if (inFilter[i]) {
        pt.fill = pointColors?.[i] ?? '#6b7280'
        if (hasSelection && selectedSet.has(i)) sel.push(pt)
        else fg.push(pt)
      } else { bg.push(pt) }
    }

    const marks = [
      Plot.dot(bg,  { x: 'x', y: 'y', r: 1.5, fill: '#d1d5db', fillOpacity: 0.35 }),
      Plot.dot(fg,  { x: 'x', y: 'y', r: 1.5, fill: d => d.fill, fillOpacity: hasSelection ? 0.25 : 0.75 }),
    ]
    if (sel.length > 0)
      marks.push(Plot.dot(sel, { x: 'x', y: 'y', r: 4, fill: d => d.fill, fillOpacity: 1, stroke: 'white', strokeWidth: 1.5 }))

    if (labelCentroids.length > 0 && dataExtent) {
      const curXSpan = xDomain ? xDomain[1] - xDomain[0] : dataExtent.xSpan
      const zoomLevel = dataExtent.xSpan / curXSpan
      const [cxMin, cxMax] = xDomain ? xDomain : [dataExtent.xMin, dataExtent.xMax]
      const [cyMin, cyMax] = yDomain ? yDomain : [dataExtent.yMin, dataExtent.yMax]
      const visible = labelCentroids.filter(c => c.x >= cxMin && c.x <= cxMax && c.y >= cyMin && c.y <= cyMax)
      const opacity = Math.min(1, 0.4 + zoomLevel * 0.3)
      const size = Math.min(13, 9 + zoomLevel)
      if (visible.length > 0)
        marks.push(Plot.text(visible, {
          x: 'x', y: 'y', text: 'text', fontSize: size, fontWeight: 'bold',
          stroke: 'white', strokeWidth: 3, strokeOpacity: opacity * 0.85,
          fill: d => d.fill, fillOpacity: opacity, textAnchor: 'middle', lineAnchor: 'middle',
        }))
    }

    const plot = Plot.plot({
      width: w, height: h, margin: 10,
      x: { axis: null, ...(xDomain ? { domain: xDomain } : {}) },
      y: { axis: null, ...(yDomain ? { domain: yDomain } : {}) },
      marks,
    })
    plotRef.current = plot
    containerRef.current.innerHTML = ''
    containerRef.current.appendChild(plot)
    return () => plot.remove?.()
  }, [arrowData, filteredMask, pointColors, selection, xDomain, yDomain, labelCentroids, dataExtent])

  // Bottom marginal histogram (umap_x distribution of filtered points)
  useEffect(() => {
    if (!arrowData || !xHistRef.current) return
    const w = xHistRef.current.clientWidth
    if (!w) return
    const data = []
    if (filteredMask) {
      const idx = getIndices(filteredMask)
      for (const i of idx) data.push({ x: arrowData.umap_x[i] })
    } else {
      for (let i = 0; i < arrowData.length; i++) data.push({ x: arrowData.umap_x[i] })
    }
    const plot = Plot.plot({
      width: w, height: 48,
      marginTop: 2, marginBottom: 0, marginLeft: 10, marginRight: 10,
      x: { axis: null, ...(xDomain ? { domain: xDomain } : {}) },
      y: { axis: null },
      marks: [Plot.rectY(data, Plot.binX({ y: 'count' }, { x: 'x', fill: '#2d5238', fillOpacity: 0.45, thresholds: 60 }))],
    })
    xHistRef.current.innerHTML = ''
    xHistRef.current.appendChild(plot)
    return () => plot.remove?.()
  }, [arrowData, filteredMask, xDomain])

  // Zoom / pan via refs (so wheel handler closure is always fresh)
  const zoomFn = useRef(null)
  zoomFn.current = (px, py, factor) => {
    const plot = plotRef.current; if (!plot) return
    try {
      const xSc = plot.scale('x'), ySc = plot.scale('y')
      const [x0, x1] = xSc.domain, [y0, y1] = ySc.domain
      const cx = px != null ? xSc.invert(px) : (x0 + x1) / 2
      const cy = py != null ? ySc.invert(py) : (y0 + y1) / 2
      setXDomain([cx + (x0 - cx) * factor, cx + (x1 - cx) * factor])
      setYDomain([cy + (y0 - cy) * factor, cy + (y1 - cy) * factor])
    } catch (_) {}
  }

  const panFn = useRef(null)
  panFn.current = (dx, dy) => {
    const plot = plotRef.current; if (!plot) return
    try {
      const xSc = plot.scale('x'), ySc = plot.scale('y')
      const [x0, x1] = xSc.domain, [y0, y1] = ySc.domain
      const shiftX = xSc.invert(dx) - xSc.invert(0)
      const shiftY = ySc.invert(dy) - ySc.invert(0)
      setXDomain([x0 - shiftX, x1 - shiftX])
      setYDomain([y0 - shiftY, y1 - shiftY])
    } catch (_) {}
  }

  function getPos(e) {
    const rect = wrapperRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function findNearest(posX, posY, thresholdPx = 14) {
    const plot = plotRef.current
    if (!plot || !arrowData) return null
    try {
      const xSc = plot.scale('x'), ySc = plot.scale('y')
      const dataX = xSc.invert(posX), dataY = ySc.invert(posY)
      const threshX = Math.abs(xSc.invert(thresholdPx) - xSc.invert(0))
      const threshY = Math.abs(ySc.invert(thresholdPx) - ySc.invert(0))
      const thresh = Math.max(threshX, threshY)
      let nearestIdx = -1, nearestDist = Infinity
      for (let i = 0; i < arrowData.length; i++) {
        if (filteredMask && !(filteredMask[i >> 3] & (1 << (i & 7)))) continue
        const dx = arrowData.umap_x[i] - dataX, dy = arrowData.umap_y[i] - dataY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < nearestDist) { nearestDist = dist; nearestIdx = i }
      }
      return nearestIdx >= 0 && nearestDist <= thresh ? nearestIdx : null
    } catch (_) { return null }
  }

  function onMouseDown(e) {
    if (e.button !== 0) return
    dragStart.current = getPos(e)
    isDragging.current = false
    setBrush(null)
    setHovered(null)
  }

  function onMouseMove(e) {
    const pos = getPos(e)

    if (!dragStart.current) {
      // Hover — throttle to 5px movement
      const last = lastHoverPos.current
      if (last && Math.abs(pos.x - last.x) < 5 && Math.abs(pos.y - last.y) < 5) return
      lastHoverPos.current = pos
      const idx = findNearest(pos.x, pos.y, 14)
      if (idx !== null) {
        setHovered({ x: pos.x, y: pos.y, title: arrowData.title?.[idx] ?? '', year: arrowData.year?.[idx] ?? '' })
      } else {
        setHovered(null)
      }
      return
    }

    const dx = pos.x - dragStart.current.x, dy = pos.y - dragStart.current.y
    if (!isDragging.current && Math.abs(dx) < 5 && Math.abs(dy) < 5) return
    isDragging.current = true

    if (panMode) {
      panFn.current(dx * PAN_SENSITIVITY, dy * PAN_SENSITIVITY)
      dragStart.current = pos
    } else {
      setBrush({
        x1: Math.min(dragStart.current.x, pos.x), y1: Math.min(dragStart.current.y, pos.y),
        x2: Math.max(dragStart.current.x, pos.x), y2: Math.max(dragStart.current.y, pos.y),
      })
    }
  }

  function onMouseUp(e) {
    if (!dragStart.current) return
    const pos = getPos(e)
    const plot = plotRef.current

    if (plot && arrowData) {
      try {
        const xSc = plot.scale('x'), ySc = plot.scale('y')
        if (!isDragging.current) {
          const idx = findNearest(pos.x, pos.y, 10)
          if (idx !== null) onSelect(new Int32Array([idx]))
          else onSelect(null)
        } else if (brush) {
          const b = brush
          const minX = Math.min(xSc.invert(b.x1), xSc.invert(b.x2))
          const maxX = Math.max(xSc.invert(b.x1), xSc.invert(b.x2))
          const minY = Math.min(ySc.invert(b.y1), ySc.invert(b.y2))
          const maxY = Math.max(ySc.invert(b.y1), ySc.invert(b.y2))
          const selected = []
          for (let i = 0; i < arrowData.length; i++) {
            if (filteredMask && !(filteredMask[i >> 3] & (1 << (i & 7)))) continue
            const x = arrowData.umap_x[i], y = arrowData.umap_y[i]
            if (x >= minX && x <= maxX && y >= minY && y <= maxY) selected.push(i)
          }
          onSelect(selected.length > 0 ? new Int32Array(selected) : null)
        }
      } catch (_) {}
    }

    dragStart.current = null
    setBrush(null)
    isDragging.current = false
  }

  function onMouseLeave() {
    setHovered(null)
    if (!isDragging.current) return
    dragStart.current = null; setBrush(null); isDragging.current = false
  }

  function onWheel(e) {
    e.preventDefault()
    const pos = getPos(e)
    const step = Math.min(0.35, Math.abs(e.deltaY) * ZOOM_SENSITIVITY)
    zoomFn.current(pos.x, pos.y, e.deltaY > 0 ? 1 + step : 1 / (1 + step))
  }

  const isZoomed = xDomain !== null
  const availableColorGroups = COLOR_GROUPS.filter(g => info?.groups?.[g.key])

  return (
    <div className="w-full h-full flex flex-col select-none">
      {/* Main scatter canvas */}
      <div
        ref={wrapperRef}
        className="flex-1 relative"
        style={{ cursor: panMode ? 'grab' : 'crosshair' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onWheel={onWheel}
      >
        <div ref={containerRef} className="w-full h-full" style={{ pointerEvents: 'none' }} />

        {/* Lasso brush rectangle */}
        {brush && (
          <div
            className="absolute border border-[#2d5238] bg-[#2d5238] pointer-events-none rounded-sm"
            style={{ left: brush.x1, top: brush.y1, width: brush.x2 - brush.x1, height: brush.y2 - brush.y1, opacity: 0.15 }}
          />
        )}

        {/* Hover tooltip */}
        {hovered && (
          <div
            className="absolute z-50 pointer-events-none bg-white border border-gray-200 rounded shadow-lg px-2.5 py-2 text-xs max-w-[260px]"
            style={{ left: Math.min(hovered.x + 14, (wrapperRef.current?.clientWidth ?? 500) - 270), top: hovered.y - 10 }}
          >
            <div className="text-gray-400 text-[10px] mb-0.5 font-medium">{hovered.year}</div>
            <div className="text-gray-800 leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{hovered.title}</div>
          </div>
        )}

        {/* Color group selector — top left */}
        {availableColorGroups.length > 1 && (
          <div className="absolute top-2 left-2 flex items-center gap-1 pointer-events-auto bg-white/80 rounded px-1.5 py-0.5 backdrop-blur-sm border border-gray-100">
            <span className="text-[10px] text-gray-400 mr-0.5">color:</span>
            {availableColorGroups.map(g => (
              <button
                key={g.key}
                onClick={() => setColorGroup(g.key)}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                  colorGroup === g.key
                    ? 'bg-gray-900 text-white font-semibold'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}

        {/* Zoom / mode controls — top right */}
        <div className="absolute top-2 right-2 flex flex-col gap-1" style={{ pointerEvents: 'auto' }}>
          <CtrlBtn onClick={() => zoomFn.current(null, null, 0.7)} title="Zoom in">+</CtrlBtn>
          <CtrlBtn onClick={() => zoomFn.current(null, null, 1.35)} title="Zoom out">−</CtrlBtn>
          <CtrlBtn onClick={() => setPanMode(m => !m)} title={panMode ? 'Switch to lasso mode' : 'Switch to pan mode'} active={panMode}>↔</CtrlBtn>
          {isZoomed && <CtrlBtn onClick={() => { setXDomain(null); setYDomain(null) }} title="Reset zoom">⊡</CtrlBtn>}
        </div>

        {/* Bottom hint */}
        <div className="absolute bottom-1 left-2 text-[10px] text-gray-400 pointer-events-none">
          {selection?.length ? `${selection.length.toLocaleString()} selected · ` : ''}
          {panMode ? 'pan mode · scroll to zoom · click ↔ to lasso' : 'drag to lasso · hover to preview'}
        </div>
      </div>

      {/* Bottom marginal histogram */}
      <div ref={xHistRef} className="flex-shrink-0 bg-white/60" style={{ height: 52, pointerEvents: 'none' }} />
    </div>
  )
}

function CtrlBtn({ onClick, title, children, active }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 rounded text-sm leading-none shadow border transition-colors
        ${active ? 'bg-[#2d5238] text-white border-[#2d5238]' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'}`}
    >
      {children}
    </button>
  )
}
