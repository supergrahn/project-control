import type { AdapterModule, TranscriptEvent, BuildArgsOpts } from './types'

function buildArgs(_opts: BuildArgsOpts): string[] {
  // Ollama: prompt is written to stdin after spawn, not via args
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
