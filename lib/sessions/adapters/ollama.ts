import type { AdapterModule, TranscriptEvent, BuildArgsOpts } from './types'

function buildArgs(opts: BuildArgsOpts): string[] {
  return ['run', 'llama3']
}

function resumeArgs(_sessionId: string): string[] {
  return []
}

function parseLine(line: string): TranscriptEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  return { type: 'raw', content: trimmed }
}

const rateLimitPatterns: RegExp[] = []

export const ollamaAdapter: AdapterModule = { buildArgs, parseLine, resumeArgs, rateLimitPatterns }
