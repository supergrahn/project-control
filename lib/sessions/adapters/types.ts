import type { PermissionMode } from '@/lib/prompts'

export type TranscriptEvent = {
  type: 'init' | 'message' | 'thinking' | 'tool_call' | 'tool_result' | 'tokens' | 'error' | 'raw'
  role?: 'user' | 'assistant' | 'system'
  content?: string
  metadata?: Record<string, unknown>
}

export type BuildArgsOpts = {
  systemPrompt: string
  userContext: string
  permissionMode: PermissionMode
  sessionId: string
}

export type AdapterModule = {
  buildArgs(opts: BuildArgsOpts): string[]
  parseLine(line: string): TranscriptEvent | null
  resumeArgs(sessionId: string): string[]
  rateLimitPatterns: RegExp[]
}
