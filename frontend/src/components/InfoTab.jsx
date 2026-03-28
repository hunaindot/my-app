/**
 * components/InfoTab.jsx
 *
 * Renders src/assets/markdowns/info.md with:
 *  - Obsidian-style left navigation (outline panel, active heading tracked by scroll)
 *  - Collapsible sections (toggle button appears on heading hover)
 *  - ReactMarkdown for body content
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import infoContent from '../assets/markdowns/info.md?raw'

// ── Markdown parser ────────────────────────────────────────────────────────────
// Splits raw markdown into a preamble + flat array of { level, title, id, content }
// where `content` is the text between this heading and the next one.

function parseMarkdown(md) {
  const lines = md.split('\n')
  const sections = []
  const preambleLines = []
  const idCount = {}
  let cur = null

  function flush() {
    if (!cur) return
    const { _lines, ...rest } = cur
    sections.push({ ...rest, content: _lines.join('\n').trim() })
  }

  for (const line of lines) {
    const m = line.match(/^(#{1,3})\s+(.+)/)
    if (m) {
      flush()
      const level = m[1].length
      const title = m[2].trim()
      const base  = title.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '')
      idCount[base] = (idCount[base] ?? 0) + 1
      const id = idCount[base] > 1 ? `${base}-${idCount[base]}` : base
      cur = { level, title, id, _lines: [] }
    } else if (cur) {
      cur._lines.push(line)
    } else {
      preambleLines.push(line)
    }
  }
  flush()

  return { preamble: preambleLines.join('\n').trim(), sections }
}

// Which sections are visible given current collapsed state.
// Collapsing a heading hides all deeper sections until the next same-or-higher heading.
function computeVisible(sections, collapsed) {
  const vis = new Array(sections.length).fill(true)
  let hideBelow = null

  for (let i = 0; i < sections.length; i++) {
    const { level, id } = sections[i]
    if (hideBelow !== null) {
      if (level <= hideBelow) hideBelow = null
      else { vis[i] = false; continue }
    }
    if (collapsed.has(id)) hideBelow = level
  }
  return vis
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function InfoTab() {
  const { preamble, sections } = useMemo(() => parseMarkdown(infoContent), [])
  const [collapsed, setCollapsed] = useState(new Set())
  const [activeId,  setActiveId]  = useState(sections[0]?.id ?? null)
  const contentRef = useRef(null)

  const visible = useMemo(() => computeVisible(sections, collapsed), [sections, collapsed])

  function toggle(id) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function scrollTo(id) {
    const root = contentRef.current
    const el   = document.getElementById(id)
    if (!root || !el) return
    root.scrollTo({ top: el.offsetTop - 32, behavior: 'smooth' })
  }

  // Track the active heading as the user scrolls
  useEffect(() => {
    const root = contentRef.current
    if (!root) return

    function onScroll() {
      const scrollTop = root.scrollTop + 48
      let active = sections[0]?.id ?? null
      for (const s of sections) {
        const el = document.getElementById(s.id)
        if (el && el.offsetTop <= scrollTop) active = s.id
      }
      setActiveId(active)
    }

    root.addEventListener('scroll', onScroll, { passive: true })
    return () => root.removeEventListener('scroll', onScroll)
  }, [sections])

  return (
    <div className="flex flex-1 overflow-hidden bg-white">

      {/* ── Left navigation (outline) ─────────────────────────────────────── */}
      <nav className="w-52 flex-shrink-0 overflow-y-auto border-r border-gray-100 py-5 bg-gray-50">
        <div className="px-4 mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          On this page
        </div>

        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => scrollTo(s.id)}
            title={s.title}
            style={{ paddingLeft: `${(s.level - 1) * 14 + 14}px` }}
            className={`w-full text-left py-0.5 pr-3 text-xs truncate transition-colors leading-5
              ${activeId === s.id
                ? 'text-amber-700 font-semibold'
                : 'text-gray-500 hover:text-gray-900'
              }
              ${s.level === 1 ? 'mt-1.5' : ''}
            `}
          >
            {s.level > 1 && (
              <span className="mr-1 text-gray-300">{'›'.repeat(s.level - 1)}</span>
            )}
            {s.title}
          </button>
        ))}
      </nav>

      {/* ── Content area ──────────────────────────────────────────────────── */}
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-10 py-8">

          {/* Preamble (content before first heading) */}
          {preamble && (
            <div className="prose prose-sm mb-6 text-gray-700">
              <ReactMarkdown>{preamble}</ReactMarkdown>
            </div>
          )}

          {/* Sections */}
          {sections.map((s, i) =>
            visible[i] && (
              <SectionBlock
                key={s.id}
                section={s}
                isCollapsed={collapsed.has(s.id)}
                onToggle={() => toggle(s.id)}
              />
            )
          )}
        </div>
      </div>
    </div>
  )
}

// ── Section block ──────────────────────────────────────────────────────────────

const HEADING_STYLES = {
  1: 'text-xl font-bold  text-gray-900 mt-10 mb-2 border-b border-gray-100 pb-1',
  2: 'text-base font-semibold text-gray-800 mt-7 mb-1.5',
  3: 'text-sm font-semibold text-gray-700 mt-5 mb-1',
}

function SectionBlock({ section, isCollapsed, onToggle }) {
  const { level, title, id, content } = section
  const Tag = `h${level}`

  return (
    <div>
      {/* Heading row — toggle button appears on hover */}
      <div className="flex items-baseline gap-1.5 group">
        <Tag
          id={id}
          className={`flex-1 scroll-mt-8 ${HEADING_STYLES[level] ?? 'text-sm font-medium mt-4 mb-1'}`}
        >
          {title}
        </Tag>
        <button
          onClick={onToggle}
          title={isCollapsed ? 'Expand section' : 'Collapse section'}
          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0
                     text-[10px] text-gray-400 hover:text-amber-700 px-1 py-0.5 rounded
                     leading-none mt-0.5"
        >
          {isCollapsed ? '▶' : '▼'}
        </button>
      </div>

      {/* Section body */}
      {!isCollapsed && content && (
        <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}
