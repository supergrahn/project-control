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
    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={disabled ? 'No active session' : 'Send input to session...'}
        style={{
          flex: 1,
          background: '#0a0c0e',
          border: '1px solid #1c1f22',
          borderRadius: 6,
          padding: '6px 10px',
          color: '#c8d0da',
          fontSize: 12,
          fontFamily: 'monospace',
          outline: 'none',
          opacity: disabled ? 0.5 : 1,
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={disabled}
        aria-label="Send"
        style={{
          background: disabled ? '#1c1f22' : '#2563eb',
          color: disabled ? '#454c54' : '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '6px 14px',
          fontSize: 12,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        Send
      </button>
    </div>
  )
}
