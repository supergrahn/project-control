'use client'
import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { X } from 'lucide-react'
import type { MarkdownFile } from '@/hooks/useFiles'
import type { Components } from 'react-markdown'
import { useNote, useUpdateNote } from '@/hooks/useNotes'

type Props = {
  file: MarkdownFile | null
  onClose: () => void
}

const md: Components = {
  h1: ({ children }) => (
    <h1 className="text-2xl font-bold text-zinc-50 mt-0 mb-4 leading-tight">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold text-zinc-100 mt-7 mb-3 pb-2 border-b border-zinc-800">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold text-zinc-200 mt-5 mb-2">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold text-zinc-300 mt-4 mb-1 uppercase tracking-wide">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="text-sm text-zinc-300 leading-7 mb-4">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-4 space-y-1 pl-5 list-disc marker:text-zinc-600">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-4 space-y-1 pl-5 list-decimal marker:text-zinc-500">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-sm text-zinc-300 leading-7 pl-1">{children}</li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-4 pl-4 border-l-2 border-violet-500 text-zinc-400 italic [&>p]:mb-0">{children}</blockquote>
  ),
  hr: () => <hr className="my-6 border-zinc-800" />,
  strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
  em: ({ children }) => <em className="italic text-zinc-300">{children}</em>,
  del: ({ children }) => <del className="line-through text-zinc-500">{children}</del>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="text-violet-400 hover:text-violet-300 underline underline-offset-2 decoration-violet-400/40 hover:decoration-violet-300/60 transition-colors">
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    if (className?.startsWith('language-')) {
      return <code className={`${className} text-[13px] leading-relaxed`}>{children}</code>
    }
    return (
      <code className="text-[13px] font-mono bg-zinc-800 text-violet-300 rounded px-1.5 py-0.5 border border-zinc-700">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="my-4 rounded-lg bg-[#0d1117] border border-zinc-800 p-4 overflow-x-auto text-[13px] leading-relaxed">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-zinc-800/60 border-b border-zinc-700">{children}</thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-zinc-800">{children}</tbody>
  ),
  tr: ({ children }) => (
    <tr className="hover:bg-zinc-800/30 transition-colors">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2.5 text-zinc-300">{children}</td>
  ),
  img: ({ src, alt }) => (
    <img src={src} alt={alt} className="rounded-lg border border-zinc-800 my-4 max-w-full" />
  ),
}

export function FileDrawer({ file, onClose }: Props) {
  const { data: noteData } = useNote(file?.path ?? null)
  const updateNote = useUpdateNote()
  const [noteText, setNoteText] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)
  const noteSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (noteSaveTimerRef.current) clearTimeout(noteSaveTimerRef.current) }
  }, [])

  // Sync note text when file changes
  useEffect(() => {
    if (noteData?.note !== undefined) setNoteText(noteData.note ?? '')
  }, [noteData])

  const handleNoteBlur = () => {
    if (!file) return
    updateNote.mutate({ filePath: file.path, note: noteText }, {
      onSuccess: () => {
        setNoteSaved(true)
        noteSaveTimerRef.current = setTimeout(() => setNoteSaved(false), 2000)
      },
    })
  }

  if (!file) return null
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-[680px] z-50 bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <h2 className="font-semibold text-zinc-100 truncate text-base">{file.title}</h2>
          <button type="button" onClick={onClose}
            className="text-zinc-500 hover:text-zinc-100 transition-colors ml-4 shrink-0 p-1 rounded hover:bg-zinc-800">
            <X size={16} />
          </button>
        </div>
        {file && (
          <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-950/50">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Notes for Claude</label>
              {noteSaved && <span className="text-[10px] text-green-400">Saved ✓</span>}
            </div>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onBlur={handleNoteBlur}
              placeholder="Add notes that will be included in session context..."
              rows={2}
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-violet-500 resize-none"
            />
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-7 py-6">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={md}>
            {file.content}
          </ReactMarkdown>
        </div>
      </aside>
    </>
  )
}
