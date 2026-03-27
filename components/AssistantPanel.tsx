'use client'
import { useState, useRef, useEffect } from 'react'
import { X, Brain, Send, Trash2, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useSuggestions, useAssistantChat } from '@/hooks/useAssistant'
import { useProjectStore } from '@/hooks/useProjects'
import type { Suggestion } from '@/lib/assistant'

const PRIORITY_COLORS: Record<string, string> = {
  high: 'border-l-red-500',
  medium: 'border-l-amber-500',
  low: 'border-l-zinc-600',
}

function SuggestionCard({ suggestion, onAction }: { suggestion: Suggestion; onAction: (s: Suggestion) => void }) {
  return (
    <div className={`bg-zinc-900/80 border border-zinc-800 border-l-2 ${PRIORITY_COLORS[suggestion.priority]} rounded-r-lg p-2.5 cursor-pointer hover:bg-zinc-800/80 transition-colors`}
      onClick={() => onAction(suggestion)}>
      <div className="flex items-start gap-2">
        <span className="text-sm">{suggestion.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-zinc-200">{suggestion.title}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">{suggestion.description}</p>
        </div>
      </div>
      {suggestion.action && (
        <div className="mt-1.5 pl-6">
          <span className="text-[10px] text-violet-400">{suggestion.action.label}</span>
        </div>
      )}
    </div>
  )
}

type Props = {
  isOpen: boolean
  onClose: () => void
  currentPage: string
}

export function AssistantPanel({ isOpen, onClose, currentPage }: Props) {
  const { selectedProject } = useProjectStore()
  const { data: suggestionsData } = useSuggestions()
  const chat = useAssistantChat(selectedProject?.id ?? null, currentPage)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.messages, chat.streamingContent])

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  if (!isOpen) return null

  const suggestions = suggestionsData?.suggestions ?? []

  const handleSend = () => {
    if (!input.trim()) return
    chat.sendMessage(input)
    setInput('')
  }

  const handleSuggestionAction = (s: Suggestion) => {
    if (!s.action) return
    switch (s.action.type) {
      case 'navigate':
        if (s.action.payload.route) router.push(s.action.payload.route)
        break
      case 'launch_session':
        // Navigate to plans page where they can launch
        router.push('/plans')
        break
      case 'run_audit':
        router.push('/plans')
        break
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <aside className="w-[320px] shrink-0 border-l border-zinc-800 bg-zinc-950 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-violet-400" />
          <span className="text-sm font-semibold text-zinc-100">Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          {chat.messages.length > 0 && (
            <button onClick={chat.clearChat} className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors" title="Clear chat">
              <Trash2 size={12} />
            </button>
          )}
          <button onClick={onClose} className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && chat.messages.length === 0 && (
        <div className="px-3 py-3 border-b border-zinc-800/50">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Suggestions</p>
          <div className="flex flex-col gap-1.5">
            {suggestions.map(s => (
              <SuggestionCard key={s.id} suggestion={s} onAction={handleSuggestionAction} />
            ))}
          </div>
        </div>
      )}

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {chat.messages.length === 0 && suggestions.length === 0 && (
          <div className="text-center py-8">
            <Sparkles size={24} className="text-zinc-700 mx-auto mb-2" />
            <p className="text-zinc-500 text-xs">Ask me about your projects, or</p>
            <p className="text-zinc-500 text-xs">I'll suggest what to do next.</p>
          </div>
        )}
        {chat.messages.map((msg, i) => (
          <div key={i} className={`mb-3 ${msg.role === 'user' ? 'text-right' : ''}`}>
            <div className={`inline-block max-w-[90%] text-left rounded-lg px-3 py-2 text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'bg-violet-600/20 text-violet-200'
                : 'bg-zinc-900 text-zinc-300 border border-zinc-800'
            }`}>
              <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
            </div>
          </div>
        ))}
        {chat.isStreaming && chat.streamingContent && (
          <div className="mb-3">
            <div className="inline-block max-w-[90%] rounded-lg px-3 py-2 text-xs leading-relaxed bg-zinc-900 text-zinc-300 border border-zinc-800">
              <pre className="whitespace-pre-wrap font-sans">{chat.streamingContent}</pre>
              <span className="inline-block w-1.5 h-3 bg-violet-400 animate-pulse ml-0.5" />
            </div>
          </div>
        )}
        {chat.isStreaming && !chat.streamingContent && (
          <div className="mb-3">
            <div className="inline-block rounded-lg px-3 py-2 text-xs bg-zinc-900 border border-zinc-800">
              <span className="text-zinc-500 animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-zinc-800">
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the assistant..."
            disabled={chat.isStreaming}
            className="flex-1 bg-transparent text-xs text-zinc-200 outline-none placeholder-zinc-600"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || chat.isStreaming}
            className="text-violet-400 hover:text-violet-300 disabled:text-zinc-700 transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </aside>
  )
}
