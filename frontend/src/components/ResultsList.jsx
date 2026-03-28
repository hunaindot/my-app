/**
 * components/ResultsList.jsx
 *
 * Right sidebar. Shows paginated document cards.
 * When a scatterplot selection is active, shows only those docs.
 * Otherwise shows the current filtered set.
 */
import { useState, useEffect } from 'react'
import { getIndices } from '../utils/bitmask'
import { fetchDocuments } from '../utils/api'

export default function ResultsList({ filteredMask, arrowData, totalVisible, selection, onClearSelection }) {
  const [page, setPage] = useState(0)
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(false)
  const LIMIT = 10

  const hasSelection = selection && selection.length > 0

  // Reset to page 0 when filter or selection changes
  useEffect(() => { setPage(0) }, [filteredMask, selection])

  useEffect(() => {
    if (!arrowData) return
    setLoading(true)

    let ids
    if (hasSelection) {
      ids = Array.from(selection)
    } else if (filteredMask) {
      ids = Array.from(getIndices(filteredMask))
    } else {
      ids = Array.from({ length: arrowData.length }, (_, i) => i)
    }

    const pageIds = ids.slice(page * LIMIT, (page + 1) * LIMIT)
    fetchDocuments(pageIds, 0, LIMIT)
      .then(setDocs)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [filteredMask, selection, page, arrowData])

  const count = hasSelection ? selection.length : totalVisible
  const totalPages = Math.ceil(count / LIMIT)

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Results
        </span>
        {hasSelection && (
          <button
            onClick={onClearSelection}
            className="text-xs text-blue-600 hover:underline"
          >
            ✕ Clear selection ({selection.length.toLocaleString()})
          </button>
        )}
      </div>

      {!hasSelection && (
        <div className="text-xs text-gray-500 mb-3">
          Showing {totalVisible.toLocaleString()} documents
        </div>
      )}

      {loading && <p className="text-xs text-gray-400">Loading…</p>}

      {docs.map(doc => (
        <DocumentCard key={doc.id} doc={doc} />
      ))}

      {totalPages > 1 && (
        <div className="flex items-center gap-1 mt-4 flex-wrap">
          {Array.from({ length: Math.min(totalPages, 8) }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              className={`w-7 h-7 text-xs rounded ${
                page === i
                  ? 'bg-amber-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {i + 1}
            </button>
          ))}
          {totalPages > 8 && <span className="text-xs text-gray-400">…</span>}
        </div>
      )}
    </div>
  )
}

function DocumentCard({ doc }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mb-4 pb-4 border-b border-gray-100">
      <p className="font-semibold text-gray-900 leading-tight mb-0.5">
        {doc.title}
      </p>
      <p className="text-xs text-gray-500 mb-1">
        {doc.year}{doc.authors ? ` | ${doc.authors}` : ''}
      </p>
      {doc.abstract && (
        <div className="mb-1">
          <p className={`text-xs text-gray-700 leading-relaxed ${expanded ? '' : 'line-clamp-4'}`}>
            {doc.abstract}
          </p>
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[10px] text-blue-600 hover:underline mt-0.5"
          >
            {expanded ? 'Read less' : 'Read more'}
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-1 mt-1">
        {doc.drivers?.map(d => (
          <span key={d} className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
            {d}
          </span>
        ))}
      </div>
      {doc.doi && (
        <a
          href={`https://doi.org/${doc.doi}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-blue-600 hover:underline mt-1 inline-block"
        >
          {doc.doi}
        </a>
      )}
    </div>
  )
}
