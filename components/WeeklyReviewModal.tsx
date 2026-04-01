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

  const handleDownload = () => {
    window.open('/api/export?type=weekly', '_blank')
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-bg-overlay" onClick={onClose} />
      <div className="fixed top-[10%] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg bg-bg-primary border border-border-strong rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-default">
          <h2 className="text-sm font-semibold text-text-primary">Weekly Review</h2>
          <div className="flex items-center gap-2">
            <button onClick={handleCopy} className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary">
              {copied ? <Check size={12} className="text-accent-green" /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button onClick={handleDownload} className="text-xs text-text-secondary hover:text-text-primary">↓ Download</button>
            <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={14} /></button>
          </div>
        </div>
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          {loading ? <p className="text-text-muted text-sm animate-pulse">Generating review...</p> :
            <pre className="text-sm text-text-primary whitespace-pre-wrap font-sans leading-relaxed">{content}</pre>}
        </div>
      </div>
    </>
  )
}
