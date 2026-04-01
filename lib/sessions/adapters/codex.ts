import type { AdapterModule, TranscriptEvent, BuildArgsOpts } from './types'

function buildArgs(opts: BuildArgsOpts): string[] {
  const prompt = `${opts.systemPrompt}\n\n---\n\n${opts.userContext}`.trim()
  return ['exec', prompt]
}

function resumeArgs(sessionId: string): string[] {
  return ['exec', '--session-id', sessionId]
}

function parseLine(line: string): TranscriptEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  let data: Record<string, unknown>
  try {
    data = JSON.parse(trimmed)
  } catch {
    return { type: 'raw', content: trimmed }
  }

  if (data.type === 'thread.started') {
    return {
      type: 'init',
      metadata: {
        sessionId: (data.thread_id ?? '') as string,
        model: 'codex',
        provider: 'codex',
      },
    }
  }

  if (data.type === 'item.completed' && data.item) {
    const item = data.item as { role?: string; content?: Array<{ type: string; text?: string }> }
    if (item.role === 'assistant' && item.content) {
      const text = item.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('\n')
      if (text) return { type: 'message', role: 'assistant', content: text }
    }
  }

  if (data.type === 'turn.completed' && data.usage) {
    const usage = data.usage as Record<string, number>
    return {
      type: 'tokens',
      metadata: {
        input: usage.input_tokens ?? 0,
        output: usage.output_tokens ?? 0,
        cached: 0,
        costUsd: 0,
      },
    }
  }

  if (data.type === 'turn.failed') {
    return {
      type: 'error',
      content: (data.error ?? 'unknown error') as string,
      metadata: { code: 'turn.failed', isRateLimit: false },
    }
  }

  return { type: 'raw', content: trimmed }
}

const HTTP_429 = /(?<![=]\s{0,5})\b429\b/

const rateLimitPatterns: RegExp[] = [
  /rate_limit_exceeded/,
  /quota_exceeded/,
  HTTP_429,
]

export const codexAdapter: AdapterModule = { buildArgs, parseLine, resumeArgs, rateLimitPatterns }
