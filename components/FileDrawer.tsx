'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { X } from 'lucide-react'
import type { MarkdownFile } from '@/hooks/useFiles'

type Props = {
  file: MarkdownFile | null
  onClose: () => void
}

export function FileDrawer({ file, onClose }: Props) {
  if (!file) return null
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-[600px] z-50 bg-zinc-900 border-l border-zinc-800 flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <h2 className="font-semibold text-zinc-100 truncate">{file.title}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 prose prose-invert prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{file.content}</ReactMarkdown>
        </div>
      </aside>
    </>
  )
}
