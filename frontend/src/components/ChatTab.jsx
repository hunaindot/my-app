/**
 * components/ChatTab.jsx
 *
 * Thin chat UI. Responsibilities:
 *   - Client-side title search over the filtered corpus (needs arrowData + filteredMask)
 *   - Client-side selection stats from bitmasks
 *   - Resolve active filter IDs → human-readable names
 *   - POST to /api/chat with pre-resolved context + relevant doc IDs
 *   - Render message history, typing indicator, token badge
 *
 * All LLM logic (prompt building, model selection, tool calls) lives in api/chat/.
 */
import { useState, useRef, useEffect, useMemo } from 'react'
import { sendChatMessage } from '../utils/api'

const MAX_CONTEXT_DOCS = 12

const STOPWORDS = new Set([
  'the','and','for','with','from','that','this','are','was','were','have',
  'has','been','not','but','they','their','its','into','can','how','what',
  'which','who','when','where','why','more','also','than','about','does',
  'study','studies','paper','research','effect','effects','impact','impacts',
])

// ---------------------------------------------------------------------------
// Client-side utilities
// ---------------------------------------------------------------------------

function popByte(x) {
  x -= (x >> 1) & 0x55
  x  = (x & 0x33) + ((x >> 2) & 0x33)
  return (x + (x >> 4)) & 0x0f
}

/**
 * Label distribution from bitmasks — no API call.
 * filteredMask === null means full corpus.
 */
function computeSelectionStats(info, bitmasks, filteredMask) {
  if (!info) return {}
  const stats = {}
  for (const [gk, group] of Object.entries(info.groups)) {
    const groupMasks = bitmasks[gk] || {}
    const counts = []
    for (const label of Object.values(group.labels)) {
      const lm = groupMasks[label.id]
      if (!lm) continue
      let n = 0
      if (filteredMask) {
        const len = Math.min(filteredMask.length, lm.length)
        for (let i = 0; i < len; i++) n += popByte(filteredMask[i] & lm[i])
      } else {
        for (let i = 0; i < lm.length; i++) n += popByte(lm[i])
      }
      if (n > 0) counts.push({ name: label.name, count: n })
    }
    counts.sort((a, b) => b.count - a.count)
    if (counts.length > 0) stats[group.name] = counts
  }
  return stats
}

/**
 * Keyword relevance search over filtered titles — no API call.
 * filteredMask === null means search full corpus.
 */
function searchTitles(query, arrowData, filteredMask, topN = MAX_CONTEXT_DOCS) {
  if (!arrowData) return []
  const tokens = query.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 3 && !STOPWORDS.has(t))
  if (tokens.length === 0) return []

  const scored = []
  function scoreIdx(idx) {
    const title = (arrowData.title[idx] ?? '').toLowerCase()
    let score = 0
    for (const token of tokens) { if (title.includes(token)) score++ }
    if (score > 0) {
      scored.push({ idx, score: score + score / (title.split(/\s+/).length) })
    }
  }

  if (filteredMask) {
    for (let i = 0; i < filteredMask.length; i++) {
      let b = filteredMask[i]
      while (b) {
        const bit = b & (-b)
        scoreIdx(i * 8 + (31 - Math.clz32(bit)))
        b ^= bit
      }
    }
  } else {
    for (let idx = 0; idx < arrowData.length; idx++) scoreIdx(idx)
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topN).map(s => s.idx)
}

/** Resolve active filter label IDs → { groupName: [labelName, ...] } */
function resolveFilterNames(info, activeFilters) {
  const resolved = {}
  for (const [gk, labelSet] of Object.entries(activeFilters)) {
    const group = info?.groups[gk]
    if (!group) continue
    const names = [...labelSet].map(lid => {
      const label = Object.values(group.labels).find(l => l.id === lid)
      return label?.name ?? lid
    })
    if (names.length > 0) resolved[group.name] = names
  }
  return resolved
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ChatTab({
  info, activeFilters, totalVisible,
  arrowData, bitmasks, filteredMask,
  yearRange, onSetGroup, onClear,
}) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! I'm your biodiversity research assistant. I search the literature in your current selection to ground my answers. Ask me anything — trends, specific topics, or how to interpret the map.",
      ts: Date.now(),
    },
  ])
  const [input, setInput]     = useState('')
  const [thinking, setThinking] = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  const selectionStats = useMemo(
    () => computeSelectionStats(info, bitmasks, filteredMask),
    [info, bitmasks, filteredMask]
  )

  async function send(text) {
    const msg = (text ?? input).trim()
    if (!msg || thinking) return
    setInput('')

    const userMsg = { role: 'user', content: msg, ts: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setThinking(true)

    // 1. Client-side title search
    const relevantIds = searchTitles(msg, arrowData, filteredMask)

    // 2. Build context payload
    const context = {
      total_visible:       totalVisible,
      active_filter_names: resolveFilterNames(info, activeFilters),
      selection_stats:     selectionStats,
      year_range:          yearRange ?? null,
    }

    // 3. Conversation history (exclude the initial greeting)
    const history = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const { reply, usage, context_docs } = await sendChatMessage(msg, history, context, relevantIds)
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: reply, ts: Date.now(), usage, contextDocs: context_docs },
      ])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `(Agent unavailable: ${err.message})`, ts: Date.now(), isEcho: true },
      ])
    } finally {
      setThinking(false)
      inputRef.current?.focus()
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  // Filter chips
  const activeChips = Object.entries(activeFilters).flatMap(([gk, labelSet]) => {
    const group = info?.groups[gk]
    if (!group) return []
    return [...labelSet].map(lid => {
      const label = Object.values(group.labels).find(l => l.id === lid)
      return { groupKey: gk, groupName: group.name, labelId: lid, name: label?.name ?? lid }
    })
  })

  function removeChip(groupKey, labelId) {
    onSetGroup(groupKey, set => { const n = new Set(set); n.delete(labelId); return n })
  }

  // Sidebar snapshot: top label per group
  const snapshot = useMemo(() =>
    Object.entries(selectionStats)
      .filter(([, counts]) => counts.length > 0)
      .map(([groupName, counts]) => ({ groupName, top: counts[0] }))
  , [selectionStats])

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">

      {/* ── Sidebar ────────────────────────────────────────────────── */}
      <aside className="w-52 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-y-auto">

        <div className="p-3 border-b border-gray-100">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Corpus</p>
          <p className="text-2xl font-bold text-amber-700 leading-none">{totalVisible.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-0.5">documents in view</p>
        </div>

        <div className="p-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Active filters</p>
            {activeChips.length > 0 && (
              <button onClick={onClear} className="text-[10px] text-gray-400 hover:text-red-500 transition-colors">
                Clear all
              </button>
            )}
          </div>
          {activeChips.length === 0 ? (
            <p className="text-xs text-gray-400 italic">None — full corpus</p>
          ) : (
            <div className="flex flex-col gap-1">
              {activeChips.map((c, i) => (
                <div key={i} className="flex items-start justify-between gap-1 text-[11px] bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1 rounded leading-tight">
                  <div>
                    <span className="text-amber-500 text-[10px] block">{c.groupName}</span>
                    {c.name}
                  </div>
                  <button onClick={() => removeChip(c.groupKey, c.labelId)}
                    className="text-amber-400 hover:text-red-500 mt-0.5 flex-shrink-0 transition-colors">×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {snapshot.length > 0 && (
          <div className="p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Selection snapshot</p>
            <div className="flex flex-col gap-1.5">
              {snapshot.map(({ groupName, top }) => (
                <div key={groupName}>
                  <p className="text-[10px] text-gray-400">{groupName}</p>
                  <p className="text-[11px] text-gray-700 font-medium leading-tight">
                    {top.name} <span className="text-gray-400 font-normal">({top.count})</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* ── Chat pane ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <div className="flex-shrink-0 px-4 py-2.5 border-b border-gray-200 bg-white flex items-center gap-3">
          <AgentAvatar />
          <div>
            <p className="text-sm font-semibold text-gray-800">BioMap Research Assistant</p>
            <p className="text-[10px] text-gray-400">
              Searches up to {MAX_CONTEXT_DOCS} relevant papers per query
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-[10px] text-gray-400">Connected</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} totalMessages={messages.length} />
          ))}
          {thinking && <ThinkingBubble />}
          <div ref={bottomRef} />
        </div>

        <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 pt-3 pb-4">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about your current selection…"
              rows={2}
              className="flex-1 resize-none text-sm border border-gray-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 bg-white placeholder:text-gray-400 transition-shadow"
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || thinking}
              className="self-end h-10 px-5 rounded-xl bg-amber-700 text-white text-sm font-medium hover:bg-amber-600 active:bg-amber-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AgentAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-amber-700 flex-shrink-0 flex items-center justify-center text-white text-xs font-bold">
      B
    </div>
  )
}

function MessageBubble({ msg, totalMessages }) {
  const isUser = msg.role === 'user'
  const time   = new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && <AgentAvatar />}
      <div className={`flex flex-col gap-1 max-w-[70%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-amber-700 text-white rounded-tr-none'
            : msg.isEcho
            ? 'bg-red-50 border border-red-200 text-red-700 rounded-tl-none'
            : 'bg-white border border-gray-200 text-gray-800 shadow-sm rounded-tl-none'
        }`}>
          {msg.content}
        </div>
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] text-gray-400">{time}</span>
          {msg.contextDocs > 0 && (
            <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">
              {msg.contextDocs} paper{msg.contextDocs > 1 ? 's' : ''} searched
            </span>
          )}
          {msg.usage && <TokenBadge usage={msg.usage} totalMessages={totalMessages} />}
        </div>
      </div>
    </div>
  )
}

function TokenBadge({ usage, totalMessages }) {
  const birthCount = useRef(totalMessages)
  const [visible, setVisible] = useState(true)
  const [fading, setFading]   = useState(false)

  useEffect(() => {
    if (totalMessages > birthCount.current) {
      setFading(true)
      const t = setTimeout(() => setVisible(false), 700)
      return () => clearTimeout(t)
    }
  }, [totalMessages])

  useEffect(() => {
    const f = setTimeout(() => setFading(true),   9000)
    const h = setTimeout(() => setVisible(false), 10000)
    return () => { clearTimeout(f); clearTimeout(h) }
  }, [])

  if (!visible) return null
  return (
    <span
      className="flex items-center gap-1 text-[10px] text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full transition-opacity duration-700"
      style={{ opacity: fading ? 0 : 1 }}
      title="Token usage"
    >
      <span className="text-gray-400">in</span> {usage.prompt_tokens}
      <span className="text-gray-300 mx-0.5">·</span>
      <span className="text-gray-400">out</span> {usage.completion_tokens}
      <span className="text-gray-300 mx-0.5">·</span>
      <span className="font-medium text-gray-600">{usage.total_tokens}</span>
    </span>
  )
}

function ThinkingBubble() {
  return (
    <div className="flex gap-2.5">
      <AgentAvatar />
      <div className="bg-white border border-gray-200 shadow-sm px-4 py-3.5 rounded-2xl rounded-tl-none">
        <div className="flex gap-1 items-center h-3">
          {['0ms', '160ms', '320ms'].map(d => (
            <span key={d} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: d }} />
          ))}
        </div>
      </div>
    </div>
  )
}
