'use client'
import { useState, useEffect } from 'react'
import { AlertCircle, CheckCircle2, Square, Zap } from 'lucide-react'

export type SessionState = 'active' | 'rate_limited' | 'paused' | 'ended' | 'unresponsive'

type SessionStatusBannerProps = {
  state: SessionState
  reason?: string
  message?: string
  provider?: string
  retryAfter?: number
}

export function SessionStatusBanner({
  state,
  reason,
  message,
  provider,
  retryAfter: initialRetryAfter,
}: SessionStatusBannerProps) {
  const [retryAfter, setRetryAfter] = useState(initialRetryAfter ?? 0)

  useEffect(() => {
    if (!initialRetryAfter || initialRetryAfter <= 0) return

    setRetryAfter(initialRetryAfter)
    const interval = setInterval(() => {
      setRetryAfter(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [initialRetryAfter])

  const renderIcon = () => {
    switch (state) {
      case 'active':
        return <span className="w-2 h-2 rounded-full bg-accent-green" />
      case 'rate_limited':
        return <AlertCircle size={14} className="text-accent-orange animate-pulse" />
      case 'unresponsive':
        return <AlertCircle size={14} className="text-accent-orange animate-pulse" />
      case 'ended':
        if (reason === 'completed') {
          return <CheckCircle2 size={14} className="text-accent-green" />
        } else if (reason === 'killed') {
          return <Square size={14} className="text-text-faint" />
        } else {
          return <AlertCircle size={14} className="text-accent-red" />
        }
      default:
        return null
    }
  }

  const renderText = () => {
    switch (state) {
      case 'active':
        return 'Running session'
      case 'rate_limited':
        return `Rate limited — ${provider || 'provider'}${retryAfter > 0 ? `. Resuming in ${retryAfter}s` : ''}`
      case 'paused':
        return 'Paused by user'
      case 'unresponsive':
        return 'No output for 5 minutes — session may be stuck'
      case 'ended':
        if (reason === 'completed') {
          return 'Session completed successfully'
        } else if (reason === 'killed') {
          return 'Session stopped by user'
        } else if (reason === 'error') {
          return message ? `Error: ${message}` : 'Session ended with error'
        } else if (reason === 'rate_limit') {
          return 'Rate limit exceeded — session ended'
        }
        return 'Session ended'
      default:
        return ''
    }
  }

  const getBackgroundColor = () => {
    switch (state) {
      case 'active':
        return '#0d2d1a'
      case 'rate_limited':
      case 'unresponsive':
        return '#2d1f0d'
      case 'ended':
        if (reason === 'error') return '#2d0d0d'
        return '#0d1a1a'
      default:
        return '#1c1f22'
    }
  }

  const getBorderColor = () => {
    switch (state) {
      case 'active':
        return '#00c875'
      case 'rate_limited':
      case 'unresponsive':
        return '#c97e2a'
      case 'ended':
        if (reason === 'error') return '#df2f4a'
        return '#454c54'
      default:
        return '#454c54'
    }
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 text-[12px] border-b border-border-default shrink-0"
      style={{
        backgroundColor: getBackgroundColor(),
        borderColor: getBorderColor(),
      }}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {renderIcon()}
        <span className="text-text-primary truncate">{renderText()}</span>
      </div>
    </div>
  )
}
