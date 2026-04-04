/**
 * utils/api.js
 *
 * Thin wrapper around the FastAPI backend.
 * fetchDocuments  — paginated document cards (results panel)
 * sendChatMessage — chat endpoint (all LLM logic lives in api/chat.py)
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

/**
 * Send a chat message to the backend agent.
 *
 * The frontend is responsible for:
 *   - title search (client-side, returns relevant_doc_ids)
 *   - stats computation (client-side bitmask ops)
 *   - resolving filter label IDs → human-readable names
 *
 * The backend (api/chat.py) handles:
 *   - fetching abstracts for relevant_doc_ids
 *   - building the system prompt
 *   - calling the LLM
 *
 * @param {string}   message          - user's message
 * @param {Array}    history          - [{role, content}, ...] conversation so far
 * @param {object}   context          - { total_visible, active_filter_names, selection_stats, year_range }
 * @param {number[]} relevantDocIds   - slim.arrow indices from client-side title search
 * @returns {{ reply, usage, context_docs }}
 */
export async function sendChatMessage(message, history, context, relevantDocIds = []) {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      history,
      context,
      relevant_doc_ids: relevantDocIds,
    }),
  })
  if (!res.ok) {
    let detail = `Chat API error ${res.status}`
    try { const body = await res.json(); detail += `: ${body.detail ?? JSON.stringify(body)}` } catch {}
    throw new Error(detail)
  }
  return await res.json()
}
