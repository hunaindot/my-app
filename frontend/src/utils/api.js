/**
 * utils/api.js
 *
 * Thin wrapper around the FastAPI backend.
 * Only used to fetch full document records (with abstracts).
 * All filtering happens client-side via bitmasks — not here.
 */
const API_URL = import.meta.env.VITE_API_URL ?? ''

/**
 * Fetch a page of full document records by their slim.arrow indices.
 *
 * @param {number[]} ids   - array of record indices (from bitmask getIndices)
 * @param {number}   page  - 0-based page number
 * @param {number}   limit - records per page (default 10)
 */
export async function fetchDocuments(ids, page = 0, limit = 10) {
  const start = page * limit
  const pageIds = ids.slice(start, start + limit)

  const res = await fetch(`${API_URL}/api/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: pageIds, page: 0, limit }),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}
