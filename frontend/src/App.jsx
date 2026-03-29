import { useState, useEffect, useCallback } from 'react'
import FilterPanel from './components/FilterPanel'
import Scatterplot from './components/Scatterplot'
import TableView from './components/TableView'
import GetView from './components/GetView'
import ThreatsView from './components/ThreatsView'
import ResultsList from './components/ResultsList'
import InfoTab from './components/InfoTab'
import { loadArrow } from './utils/arrow'
import { loadAllBitmasks, computeFilterMask, computeYearMask, combineMasks, countBits, toggleLabel } from './utils/bitmask'

const MIN_PANEL = 160
const MAX_PANEL = 560

export default function App() {
  const [tab, setTab] = useState('explorer')
  const [info, setInfo] = useState(null)
  const [arrowData, setArrowData] = useState(null)
  const [bitmasks, setBitmasks] = useState({})
  const [activeFilters, setActiveFilters] = useState({})
  const [yearRange, setYearRange] = useState(null)
  const [filteredMask, setFilteredMask] = useState(null)
  const [scatterSelection, setScatterSelection] = useState(null) // Int32Array | null
  const [viewMode, setViewMode] = useState('scatter')            // 'scatter' | 'table' | 'get' | 'threats'
  const [loading, setLoading] = useState(true)

  // Panel widths (px) — user can drag to resize
  const [filterWidth, setFilterWidth] = useState(288)   // ~w-72
  const [resultsWidth, setResultsWidth] = useState(320) // ~w-80

  // 1. Load on mount
  useEffect(() => {
    async function init() {
      const infoRes = await fetch('./data/info.json')
      const infoData = await infoRes.json()
      setInfo(infoData)
      setYearRange([infoData.start_year, infoData.end_year])
      const arrow = await loadArrow('./data/slim.arrow')
      setArrowData(arrow)
      const masks = await loadAllBitmasks(infoData, './data/bitmasks/')
      setBitmasks(masks)
      setLoading(false)
    }
    init()
  }, [])

  // 2. Recompute filtered mask
  useEffect(() => {
    if (!info || Object.keys(bitmasks).length === 0) return
    const bitmaskResult = computeFilterMask(bitmasks, activeFilters, info)
    const yearMask = computeYearMask(arrowData, yearRange, info)
    setFilteredMask(combineMasks(bitmaskResult, yearMask))
  }, [activeFilters, bitmasks, info, yearRange, arrowData])

  // 3. Clear scatterplot selection when filters change
  useEffect(() => {
    setScatterSelection(null)
  }, [activeFilters, yearRange])

  function setGroupFilters(groupKey, updater) {
    setActiveFilters(prev => {
      const next = { ...prev }
      const current = new Set(prev[groupKey] ?? [])
      const updated = updater(current)
      if (updated.size === 0) delete next[groupKey]
      else next[groupKey] = updated
      return next
    })
  }

  function handleYearRange(range) {
    const [a, b] = range
    setYearRange(a <= b ? [a, b] : [b, a])
  }

  const handleLabelClick = useCallback((groupKey, labelId) =>
    setGroupFilters(groupKey, set =>
      toggleLabel(set, labelId, info.groups[groupKey])
    )
  , [info])

  function clearFilters() {
    setActiveFilters({})
    if (info) setYearRange([info.start_year, info.end_year])
    setScatterSelection(null)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen text-gray-500 text-sm">
      Loading biodiversity map…
    </div>
  )

  const totalVisible = filteredMask ? countBits(filteredMask) : info?.total ?? 0

  return (
    <div className="flex flex-col h-screen font-sans text-sm bg-white">
      <header className="flex items-center px-4 py-2 border-b border-gray-200 bg-amber-700 text-white">
        <span className="font-semibold text-base mr-4">Biodiversity Literature Map</span>
        <button
          onClick={() => setTab('explorer')}
          className={`mr-3 px-3 py-1 rounded text-xs font-medium ${tab === 'explorer' ? 'bg-white text-amber-800' : 'text-white hover:bg-amber-600'}`}
        >
          Explorer
        </button>
        <button
          onClick={() => setTab('info')}
          className={`px-3 py-1 rounded text-xs font-medium ${tab === 'info' ? 'bg-white text-amber-800' : 'text-white hover:bg-amber-600'}`}
        >
          Info
        </button>
        <button
          onClick={() => downloadCSV(arrowData, filteredMask, bitmasks, info)}
          disabled={!arrowData}
          className="ml-auto text-xs text-white hover:underline disabled:opacity-40"
        >
          ↓ Download CSV
        </button>
      </header>

      {tab === 'info' ? (
        <InfoTab />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <aside
            style={{ width: filterWidth, minWidth: MIN_PANEL, maxWidth: MAX_PANEL }}
            className="flex-shrink-0 overflow-y-auto border-r border-gray-200 p-3"
          >
            <FilterPanel
              info={info}
              arrowData={arrowData}
              bitmasks={bitmasks}
              activeFilters={activeFilters}
              filteredMask={filteredMask}
              yearRange={yearRange}
              totalVisible={totalVisible}
              onSetGroup={setGroupFilters}
              onYearRange={handleYearRange}
              onClear={clearFilters}
            />
          </aside>

          <ResizeHandle
            onDelta={dx =>
              setFilterWidth(w => Math.max(MIN_PANEL, Math.min(MAX_PANEL, w + dx)))
            }
          />

          <main className="flex-1 overflow-hidden flex flex-col">
            {/* View toggle */}
            <div className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 border-b border-gray-100 bg-white">
              <ViewTab label="Scatter"    active={viewMode === 'scatter'}  onClick={() => setViewMode('scatter')} />
              <ViewTab label="Table"      active={viewMode === 'table'}    onClick={() => setViewMode('table')} />
              <ViewTab label="Ecosystems" active={viewMode === 'get'}      onClick={() => setViewMode('get')} />
              <ViewTab label="Threats"    active={viewMode === 'threats'}  onClick={() => setViewMode('threats')} />
            </div>
            <div className="flex-1 overflow-hidden relative">
              {viewMode === 'scatter' ? (
                <Scatterplot
                  arrowData={arrowData}
                  filteredMask={filteredMask}
                  bitmasks={bitmasks}
                  info={info}
                  selection={scatterSelection}
                  onSelect={setScatterSelection}
                />
              ) : viewMode === 'get' ? (
                <GetView
                  info={info}
                  bitmasks={bitmasks}
                  filteredMask={filteredMask}
                  activeFilters={activeFilters}
                  onLabelClick={handleLabelClick}
                />
              ) : viewMode === 'threats' ? (
                <ThreatsView
                  info={info}
                  bitmasks={bitmasks}
                  filteredMask={filteredMask}
                  activeFilters={activeFilters}
                  onLabelClick={handleLabelClick}
                />
              ) : (
                <TableView
                  arrowData={arrowData}
                  filteredMask={filteredMask}
                  bitmasks={bitmasks}
                  info={info}
                  selection={scatterSelection}
                  onSelect={setScatterSelection}
                />
              )}
            </div>
          </main>

          <ResizeHandle
            onDelta={dx =>
              setResultsWidth(w => Math.max(MIN_PANEL, Math.min(MAX_PANEL, w - dx)))
            }
          />

          <aside
            style={{ width: resultsWidth, minWidth: MIN_PANEL, maxWidth: MAX_PANEL }}
            className="flex-shrink-0 overflow-y-auto border-l border-gray-200"
          >
            <ResultsList
              filteredMask={filteredMask}
              arrowData={arrowData}
              totalVisible={totalVisible}
              selection={scatterSelection}
              onClearSelection={() => setScatterSelection(null)}
            />
          </aside>
        </div>
      )}
    </div>
  )
}

function ViewTab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs rounded font-medium transition-colors
        ${active
          ? 'bg-amber-700 text-white'
          : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
        }`}
    >
      {label}
    </button>
  )
}

/**
 * Build a CSV from the currently filtered records and trigger a browser download.
 * Columns: id, title, year, plus one column per label group showing matched label names.
 */
function downloadCSV(arrowData, filteredMask, bitmasks, info) {
  if (!arrowData || !info) return

  // Determine which record indices to export
  const indices = []
  if (!filteredMask) {
    for (let i = 0; i < arrowData.length; i++) indices.push(i)
  } else {
    for (let i = 0; i < filteredMask.length; i++) {
      let b = filteredMask[i]
      while (b) {
        const bit = b & (-b)
        indices.push(i * 8 + Math.log2(bit))
        b ^= bit
      }
    }
  }

  // Build header row
  const groupKeys = Object.keys(info.groups)
  const header = ['id', 'year', 'title', ...groupKeys]

  // Build data rows
  const rows = [header]
  for (const idx of indices) {
    const labelCols = groupKeys.map(groupKey => {
      const group = info.groups[groupKey]
      const names = []
      const masksForGroup = bitmasks[groupKey] || {}
      // prefer leaves to avoid double-reporting parent + child
      const labels = Object.values(group.labels).filter(l => !l.children || l.children.length === 0)
      for (const label of labels) {
        const mask = masksForGroup[label.id]
        if (mask && (mask[idx >> 3] & (1 << (idx & 7)))) names.push(label.name)
      }
      return names.join('; ')
    })
    rows.push([
      arrowData.id[idx],
      arrowData.year[idx],
      `"${(arrowData.title[idx] ?? '').replace(/"/g, '""')}"`,
      ...labelCols.map(v => `"${v.replace(/"/g, '""')}"`)
    ])
  }

  const csv = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filteredMask ? 'biodiversity_filtered.csv' : 'biodiversity_all.csv'
  a.click()
  URL.revokeObjectURL(url)
}

/** Drag handle between panels */
function ResizeHandle({ onDelta }) {
  function onMouseDown(e) {
    e.preventDefault()
    let lastX = e.clientX

    function onMouseMove(e) {
      onDelta(e.clientX - lastX)
      lastX = e.clientX
    }
    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1.5 flex-shrink-0 bg-gray-200 hover:bg-amber-400 active:bg-amber-500 cursor-col-resize transition-colors"
    />
  )
}
