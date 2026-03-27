'use client'
import { useState, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Suggestion } from '@/lib/assistant'

type Message = { role: 'user' | 'assistant'; content: string }

export function useSuggestions() {
  return useQuery<{ suggestions: Suggestion[] }>({
    queryKey: ['assistant-suggestions'],
    queryFn: async () => {
      const r = await fetch('/api/assistant/suggestions')
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    },
    refetchInterval: 30000,
  })
}

export function useAssistantChat(projectId: string | null, currentPage: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return

    const userMsg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setIsStreaming(true)
    setStreamingContent('')

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          projectId,
          page: currentPage,
          history: messages.slice(-10),
        }),
      })

      if (!res.ok || !res.body) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to get a response.' }])
        setIsStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        fullContent += chunk
        setStreamingContent(fullContent)
      }

      setMessages(prev => [...prev, { role: 'assistant', content: fullContent }])
      setStreamingContent('')
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error.' }])
    } finally {
      setIsStreaming(false)
    }
  }, [messages, isStreaming, projectId, currentPage])

  const clearChat = useCallback(() => {
    setMessages([])
    setStreamingContent('')
  }, [])

  return { messages, isStreaming, streamingContent, sendMessage, clearChat }
}

export function useAssistantPanel() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('assistant-panel-open')
      if (saved === 'true') setIsOpen(true)
    } catch {}
  }, [])

  const toggle = useCallback(() => {
    setIsOpen(prev => {
      const next = !prev
      try { localStorage.setItem('assistant-panel-open', String(next)) } catch {}
      return next
    })
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    try { localStorage.setItem('assistant-panel-open', 'false') } catch {}
  }, [])

  return { isOpen, toggle, close }
}
