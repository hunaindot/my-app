/**
 * components/Scatterplot.jsx
 *
 * UMAP scatterplot with:
 *  - Dots coloured by dominant IPBES driver
 *  - Click to select nearest visible point
 *  - Drag to box-select (select mode) or pan (pan mode)
 *  - Scroll wheel / pinch / +− buttons to zoom
 *  - Selected points highlighted with white ring + larger radius
 */
import { useEffect, useRef, useMemo, useState } from 'react'
import * as Plot from '@observablehq/plot'
import { getIndices } from '../utils/bitmask'

export default function Scatterplot({ arrowData, filteredMask, bitmasks, info, selection, onSelect }) {
  const wrapperRef   = useRef(null)   // outer interactive div (event target)
  const containerRef = useRef(null)   // inner div holding Plot SVG
  const plotRef      = useRef(null)   // Plot element (for scale access)
  const dragStart    = useRef(null)
  const isDragging   = useRef(false)
  const [brush,   setBrush]   = useState(null)   // { x1,y1,x2,y2 } px
  const [xDomain, setXDomain] = useState(null)   // null = auto-fit to data
  const [yDomain, setYDomain] = useState(null)
  const [panMode, setPanMode] = useState(true)  // false = select, true = pan
  const PAN_SENSITIVITY = 0.65
  const ZOOM_SENSITIVITY = 0.0015

  // ── Full data extent (for zoom-level calculation) ─────────────────────────
  const dataExtent = useMemo(() => {
    if (!arrowData) return null
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity
    for (let i = 0; i < arrowData.length; i++) {
      const x = arrowData.umap_x[i], y = arrowData.umap_y[i]
      if (x < xMin) xMin = x
      if (x > xMax) xMax = x
      if (y < yMin) yMin = y
      if (y > yMax) yMax = y
    }
    return { xMin, xMax, yMin, yMax, xSpan: xMax - xMin, ySpan: yMax - yMin }
  }, [arrowData])

  // ── Label centroids (mean UMAP position of each label's papers) ───────────
  const labelCentroids = useMemo(() => {
    if (!arrowData || !bitmasks || !info) return []
    const n = arrowData.length
    const result = []
    for (const groupKey of ['drivers', 'threats']) {
      const group = info.groups[groupKey]
      if (!group) continue
      const masksForGroup = bitmasks[groupKey] || {}
      for (const label of Object.values(group.labels)) {
        const mask = masksForGroup[label.id]
        if (!mask || label.count < 10) continue
        let sumX = 0, sumY = 0, count = 0
        for (let i = 0; i < n; i++) {
          if (mask[i >> 3] & (1 << (i & 7))) {
            sumX += arrowData.umap_x[i]
            sumY += arrowData.umap_y[i]
            count++
          }
        }
        if (count === 0) continue
        const [h, s, l] = label.colour
        result.push({
          x: sumX / count,
          y: sumY / count,
          text: label.name,
          group: groupKey,
          level: label.level ?? 0,
          // Darken the hue-colour for text legibility
          fill: `hsl(${h},${s}%,${Math.max(l - 20, 10)}%)`,
        })
      }
    }
    return result
  }, [arrowData, bitmasks, info])

  // ── Per-record driver colour ───────────────────────────────────────────────
  const driverColors = useMemo(() => {
    if (!arrowData || !bitmasks || !info) return null
    const n = arrowData.length
    const colors = new Array(n).fill(null)
    const masksForGroup = bitmasks.drivers || {}
    const entries = Object.values(info.groups.drivers.labels)
    for (const label of entries) {
      const mask = masksForGroup[label.id]
      if (!mask) continue
      const [h, s, l] = label.colour
      const colorStr = `hsl(${h},${s}%,${l}%)`
      for (let i = 0; i < n; i++) {
        if (colors[i] === null && (mask[i >> 3] & (1 << (i & 7)))) colors[i] = colorStr
      }
    }
    return colors
  }, [arrowData, bitmasks, info])

  // ── Render Plot ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!arrowData || !containerRef.current) return
    const w = containerRef.current.clientWidth
    const h = containerRef.current.clientHeight
    const n = arrowData.length

    const inFilter = new Uint8Array(n)
    if (filteredMask) {
      const indices = getIndices(filteredMask)
      for (const i of indices) inFilter[i] = 1
    } else {
      inFilter.fill(1)
    }

    const selectedSet  = selection ? new Set(Array.from(selection)) : null
    const hasSelection = selectedSet && selectedSet.size > 0

    const bg = [], fg = [], sel = []
    for (let i = 0; i < n; i++) {
      const pt = { x: arrowData.umap_x[i], y: arrowData.umap_y[i] }
      if (inFilter[i]) {
        pt.fill = driverColors?.[i] ?? '#92400e'
        if (hasSelection && selectedSet.has(i)) sel.push(pt)
        else fg.push(pt)
      } else {
        bg.push(pt)
      }
    }

    const marks = [
      Plot.dot(bg,  { x: 'x', y: 'y', r: 1.5, fill: '#d1d5db', fillOpacity: 0.35 }),
      Plot.dot(fg,  { x: 'x', y: 'y', r: 1.5, fill: d => d.fill, fillOpacity: hasSelection ? 0.3 : 0.75 }),
    ]
    if (sel.length > 0) {
      marks.push(Plot.dot(sel, { x: 'x', y: 'y', r: 4, fill: d => d.fill, fillOpacity: 1, stroke: 'white', strokeWidth: 1 }))
    }

    // ── Label overlays ─────────────────────────────────────────────────────
    if (labelCentroids.length > 0 && dataExtent) {
      const curXSpan = xDomain ? xDomain[1] - xDomain[0] : dataExtent.xSpan
      const zoomLevel = dataExtent.xSpan / curXSpan   // 1 = full view, 2 = 2× zoom …

      const curXMin = xDomain ? xDomain[0] : dataExtent.xMin
      const curXMax = xDomain ? xDomain[1] : dataExtent.xMax
      const curYMin = yDomain ? yDomain[0] : dataExtent.yMin
      const curYMax = yDomain ? yDomain[1] : dataExtent.yMax

      // Which labels are in the current viewport and at the right zoom level?
      const visible = labelCentroids.filter(c => {
        if (c.x < curXMin || c.x > curXMax || c.y < curYMin || c.y > curYMax) return false
        if (c.group === 'drivers') return true           // always
        if (c.level === 0)         return zoomLevel >= 1.3
        if (c.level === 1)         return zoomLevel >= 2.5
        return                            zoomLevel >= 4
      })

      const driverLabels = visible.filter(c => c.group === 'drivers')
      const threatLabels  = visible.filter(c => c.group === 'threats')

      const dOpacity = Math.min(1, 0.35 + (zoomLevel - 1) * 0.45)
      const tOpacity = Math.min(1, Math.max(0, (zoomLevel - 1.3) * 0.65))
      const dSize    = Math.min(13, 9 + zoomLevel)
      const tSize    = Math.min(11, 7 + zoomLevel * 0.8)

      const textOpts = (opacity, size, bold) => ({
        x: 'x', y: 'y', text: 'text',
        fontSize: size, fontWeight: bold ? 'bold' : '500',
        stroke: 'white', strokeWidth: 3, strokeOpacity: opacity * 0.85,
        fill: d => d.fill, fillOpacity: opacity,
        textAnchor: 'middle', lineAnchor: 'middle',
      })

      if (driverLabels.length > 0)
        marks.push(Plot.text(driverLabels, textOpts(dOpacity, dSize, true)))
      if (threatLabels.length > 0)
        marks.push(Plot.text(threatLabels, textOpts(tOpacity, tSize, c => c.level === 0)))
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
  }, [arrowData, filteredMask, driverColors, selection, xDomain, yDomain, labelCentroids, dataExtent])

  // ── Zoom / pan helpers (via ref so wheel listener closure is always fresh) ─
  const zoomFn = useRef(null)
  zoomFn.current = (px, py, factor) => {
    const plot = plotRef.current
    if (!plot) return
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
    const plot = plotRef.current
    if (!plot) return
    try {
      const xSc = plot.scale('x'), ySc = plot.scale('y')
      const [x0, x1] = xSc.domain, [y0, y1] = ySc.domain
      // shift = how many data units correspond to delta pixels on each axis
      const shiftX = xSc.invert(dx) - xSc.invert(0)
      const shiftY = ySc.invert(dy) - ySc.invert(0)
      setXDomain([x0 - shiftX, x1 - shiftX])
      setYDomain([y0 - shiftY, y1 - shiftY])
    } catch (_) {}
  }


  // ── Position helper ────────────────────────────────────────────────────────
  function getPos(e) {
    const rect = wrapperRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  // ── Mouse handlers ─────────────────────────────────────────────────────────
  function onMouseDown(e) {
    if (e.button !== 0) return
    dragStart.current = getPos(e)
    isDragging.current = false
    setBrush(null)
  }

  function onMouseMove(e) {
    if (!dragStart.current) return
    const pos = getPos(e)
    const dx = pos.x - dragStart.current.x
    const dy = pos.y - dragStart.current.y
    if (!isDragging.current && Math.abs(dx) < 5 && Math.abs(dy) < 5) return
    isDragging.current = true

    if (panMode) {
      panFn.current(dx * PAN_SENSITIVITY, dy * PAN_SENSITIVITY)
      dragStart.current = pos   // incremental delta: update anchor each move
    } else {
      setBrush({
        x1: Math.min(dragStart.current.x, pos.x),
        y1: Math.min(dragStart.current.y, pos.y),
        x2: Math.max(dragStart.current.x, pos.x),
        y2: Math.max(dragStart.current.y, pos.y),
      })
    }
  }

  function onMouseUp(e) {
    if (!dragStart.current) return
    const pos = getPos(e)
    const plot = plotRef.current

    if (!panMode && plot && arrowData) {
      try {
        const xSc = plot.scale('x'), ySc = plot.scale('y')
        if (!isDragging.current) {
          // Click — nearest visible point
          const dataX = xSc.invert(pos.x)
          const dataY = ySc.invert(pos.y)
          const threshX = Math.abs(xSc.invert(8) - xSc.invert(0))
          const threshY = Math.abs(ySc.invert(8) - ySc.invert(0))
          const threshold = Math.max(threshX, threshY) * 1.5

          let nearestIdx = -1, nearestDist = Infinity
          for (let i = 0; i < arrowData.length; i++) {
            if (filteredMask && !(filteredMask[i >> 3] & (1 << (i & 7)))) continue
            const dx = arrowData.umap_x[i] - dataX
            const dy = arrowData.umap_y[i] - dataY
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < nearestDist) { nearestDist = dist; nearestIdx = i }
          }
          if (nearestIdx >= 0 && nearestDist <= threshold) onSelect(new Int32Array([nearestIdx]))
          else onSelect(null)
        } else if (brush) {
          // Box select
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
    if (!isDragging.current) return
    dragStart.current = null
    setBrush(null)
    isDragging.current = false
  }

  function onWheel(e) {
    if (!zoomFn.current) return
    e.preventDefault()
    const pos = getPos(e)
    const delta = e.deltaY
    const step = Math.min(0.35, Math.abs(delta) * ZOOM_SENSITIVITY)
    const factor = delta > 0 ? 1 + step : 1 / (1 + step)
    zoomFn.current(pos.x, pos.y, factor)
  }

  const isZoomed = xDomain !== null

  return (
    <div
      ref={wrapperRef}
      className="w-full h-full relative select-none"
      style={{ cursor: panMode ? 'grab' : 'crosshair' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onWheel={onWheel}
    >
      <div ref={containerRef} className="w-full h-full" style={{ pointerEvents: 'none' }} />

      {/* Brush selection rectangle */}
      {brush && (
        <div
          className="absolute border border-amber-600 bg-amber-100 pointer-events-none"
          style={{ left: brush.x1, top: brush.y1, width: brush.x2 - brush.x1, height: brush.y2 - brush.y1, opacity: 0.35 }}
        />
      )}

      {/* Zoom / mode controls — top right */}
      <div className="absolute top-2 right-2 flex flex-col gap-1" style={{ pointerEvents: 'auto' }}>
        <CtrlBtn onClick={() => zoomFn.current(null, null, 0.7)} title="Zoom in">+</CtrlBtn>
        <CtrlBtn onClick={() => zoomFn.current(null, null, 1.35)} title="Zoom out">−</CtrlBtn>
        <CtrlBtn
          onClick={() => setPanMode(m => !m)}
          title={panMode ? 'Switch to select mode (drag to box-select)' : 'Switch to pan mode (drag to pan)'}
          active={panMode}
        >
          {panMode ? '↔' : '⊹'}
        </CtrlBtn>
        {isZoomed && (
          <CtrlBtn
            onClick={() => { setXDomain(null); setYDomain(null) }}
            title="Reset zoom"
          >
            ⊡
          </CtrlBtn>
        )}
      </div>

      {/* Hint label when pan mode is active */}
      {panMode && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] bg-black/40 text-white px-2 py-0.5 rounded pointer-events-none whitespace-nowrap">
          Pan mode · scroll to zoom · click ⊹ to select
        </div>
      )}
    </div>
  )
}

function CtrlBtn({ onClick, title, children, active }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 rounded text-sm leading-none shadow border transition-colors
        ${active
          ? 'bg-amber-700 text-white border-amber-700'
          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
        }`}
    >
      {children}
    </button>
  )
}
