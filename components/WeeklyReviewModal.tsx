'use client'
import { useState, useEffect } from 'react'
import { X, Copy, Check } from 'lucide-react'

type Props = { isOpen: boolean; onClose: () => void }

export function WeeklyReviewModal({ isOpen, onClose }: Props) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    fetch('/api/weekly-review')
      .then(r => r.json())
      .then(data => setContent(data.review))
      .catch(() => setContent('Failed to generate review.'))
      .finally(() => setLoading(false))
  }, [isOpen])

  if (!isOpen) return null

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose} />
      <div className="fixed top-[10%] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-100">Weekly Review</h2>
          <div className="flex items-center gap-2">
            <button onClick={handleCopy} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200">
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={14} /></button>
          </div>
        </div>
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          {loading ? <p className="text-zinc-500 text-sm animate-pulse">Generating review...</p> :
            <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">{content}</pre>}
        </div>
      </div>
    </>
  )
}
