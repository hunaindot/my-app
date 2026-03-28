/**
 * components/InfoTab.jsx
 *
 * Renders public/data/info.md as HTML.
 * Write the markdown once — the component handles the rest.
 */
import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'

export default function InfoTab() {
  const [md, setMd] = useState('')

  useEffect(() => {
    fetch('./data/info.md').then(r => r.text()).then(setMd)
  }, [])

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 prose prose-sm text-gray-800">
      <ReactMarkdown>{md}</ReactMarkdown>
    </div>
  )
}
