import type { AdapterModule, TranscriptEvent, BuildArgsOpts } from './types'

function buildArgs(opts: BuildArgsOpts): string[] {
  const prompt = `${opts.systemPrompt}\n\n---\n\n${opts.userContext}`.trim()
  return ['-p', prompt, '--output-format', 'stream-json', '--session-id', opts.sessionId]
}

function resumeArgs(sessionId: string): string[] {
  return ['--output-format', 'stream-json', '--session-id', sessionId]
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

  if (data.type === 'init') {
    return {
      type: 'init',
      metadata: {
        sessionId: (data.session_id ?? data.sessionId ?? '') as string,
        model: (data.model ?? '') as string,
        provider: 'gemini',
      },
    }
  }

  if (data.type === 'message' && data.role === 'assistant') {
    return {
      type: 'message',
      role: 'assistant',
      content: (data.content ?? '') as string,
      metadata: data.delta ? { delta: true } : undefined,
    }
  }

  if (data.type === 'result' && data.stats) {
    const stats = data.stats as Record<string, number>
    return {
      type: 'tokens',
      metadata: {
        input: stats.input_tokens ?? stats.inputTokens ?? stats.promptTokenCount ?? 0,
        output: stats.output_tokens ?? stats.outputTokens ?? stats.candidatesTokenCount ?? 0,
        cached: stats.cached ?? 0,
        costUsd: (data.cost_usd as number) ?? 0,
      },
    }
  }

  return { type: 'raw', content: trimmed }
}

const HTTP_429 = /(?<![=]\s{0,5})\b429\b/

const rateLimitPatterns: RegExp[] = [
  /RESOURCE_EXHAUSTED/,
  /quota exceeded/i,
  HTTP_429,
]

export const geminiAdapter: AdapterModule = { buildArgs, parseLine, resumeArgs, rateLimitPatterns }
