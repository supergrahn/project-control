'use client'
import { useState, useRef, useEffect } from 'react'
import { Search } from 'lucide-react'
import type { Command } from '@/hooks/useCommandPalette'

type Props = {
  commands: Command[]
  query: string
  onQueryChange: (q: string) => void
  onClose: () => void
}

export function CommandPalette({ commands, query, onQueryChange, onClose }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setActiveIndex(0) }, [commands])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, commands.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && commands[activeIndex]) {
      e.preventDefault()
      commands[activeIndex].action()
      onClose()
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
          <Search size={14} className="text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder-zinc-600"
          />
          <kbd className="text-[10px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">esc</kbd>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {commands.length === 0 && (
            <p className="px-4 py-6 text-sm text-zinc-600 text-center">No matching commands</p>
          )}
          {commands.map((cmd, i) => (
            <div
              key={cmd.id}
              className={`flex items-center justify-between px-4 py-2 cursor-pointer transition-colors ${
                i === activeIndex ? 'bg-violet-500/10 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/50'
              }`}
              onClick={() => { cmd.action(); onClose() }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="text-sm">{cmd.label}</span>
              {cmd.group && <span className="text-[10px] text-zinc-600">{cmd.group}</span>}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
