import type { AdapterModule, TranscriptEvent, BuildArgsOpts } from './types'

function buildArgs(opts: BuildArgsOpts): string[] {
  const args = [
    '--print',
    '--output-format', 'stream-json',
    '--verbose',
    '--system-prompt', opts.systemPrompt,
    '--session-id', opts.sessionId,
    '--permission-mode', opts.permissionMode,
  ]
  if (opts.userContext.trim()) {
    args.push(opts.userContext.trim())
  }
  return args
}

function resumeArgs(sessionId: string): string[] {
  return ['--print', '--output-format', 'stream-json', '--verbose', '--resume', sessionId]
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

  if (data.type === 'system' && data.subtype === 'init') {
    return {
      type: 'init',
      metadata: {
        sessionId: data.session_id as string,
        model: data.model as string,
        provider: 'claude',
      },
    }
  }

  if (data.type === 'assistant' && data.message) {
    const msg = data.message as { content?: Array<{ type: string; text?: string }> }
    const textBlocks = (msg.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '')
    if (textBlocks.length > 0) {
      return { type: 'message', role: 'assistant', content: textBlocks.join('\n') }
    }
  }

  if (data.type === 'result' && data.usage) {
    const usage = data.usage as Record<string, number>
    return {
      type: 'tokens',
      metadata: {
        input: usage.input_tokens ?? 0,
        output: usage.output_tokens ?? 0,
        cached: usage.cache_read_input_tokens ?? 0,
        costUsd: (data.total_cost_usd as number) ?? 0,
      },
    }
  }

  return { type: 'raw', content: trimmed }
}

const rateLimitPatterns: RegExp[] = [
  /rate_limit_exceeded/,
  /overloaded_error/,
  /\b529\b/,
]

export const claudeAdapter: AdapterModule = { buildArgs, parseLine, resumeArgs, rateLimitPatterns }
