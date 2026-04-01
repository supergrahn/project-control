'use client'
import { useState } from 'react'

type Props = {
  onSend: (text: string) => void
  disabled: boolean
}

export function SessionInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  function handleSubmit() {
    const trimmed = value.trim()
    if (!trimmed) return
    onSend(trimmed)
    setHistory(prev => {
      const updated = [trimmed, ...prev]
      return updated.slice(0, 50) // Max 50 entries
    })
    setHistoryIndex(-1)
    setValue('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1
        setHistoryIndex(newIndex)
        setValue(history[newIndex])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setValue(history[newIndex])
      } else if (historyIndex === 0) {
        setHistoryIndex(-1)
        setValue('')
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex gap-1.5 mt-2">
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={disabled ? 'No active session' : 'Send input to session...'}
        className="flex-1 bg-black border border-border-default rounded-[6px] px-2.5 py-1.5 text-[12px] font-mono outline-none"
        style={{
          color: '#c8d0da',
          opacity: disabled ? 0.5 : 1,
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={disabled}
        aria-label="Send"
        className="border-none rounded-[6px] px-3.5 py-1.5 text-[12px]"
        style={{
          background: disabled ? '#1c1f22' : '#2563eb',
          color: disabled ? '#454c54' : '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        Send
      </button>
    </div>
  )
}
