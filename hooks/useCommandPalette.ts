'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'

export type Command = {
  id: string
  label: string
  group?: string
  keywords?: string[]
  action: () => void
}

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (t.startsWith(q)) return 3
  if (t.includes(q)) return 2
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length ? 1 : 0
}

export function useCommandPalette(commands: Command[]) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')

  const open = useCallback(() => { setIsOpen(true); setQuery('') }, [])
  const close = useCallback(() => { setIsOpen(false); setQuery('') }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(prev => !prev)
        setQuery('')
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, close])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands.slice(0, 8)
    return commands
      .map(cmd => {
        const labelScore = fuzzyScore(query, cmd.label)
        const keywordScore = Math.max(0, ...(cmd.keywords?.map(k => fuzzyScore(query, k)) ?? [0]))
        return { cmd, score: Math.max(labelScore, keywordScore) }
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score || a.cmd.label.localeCompare(b.cmd.label))
      .slice(0, 8)
      .map(r => r.cmd)
  }, [commands, query])

  return { isOpen, open, close, query, setQuery, filtered }
}
