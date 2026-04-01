'use client'
import { useState } from 'react'

type Props = {
  onSend: (text: string) => void
  disabled: boolean
}

export function SessionInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState('')

  function handleSubmit() {
    const trimmed = value.trim()
    if (!trimmed) return
    onSend(trimmed)
    setValue('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
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
