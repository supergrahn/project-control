import fs from 'fs'
import path from 'path'
import type { Agent } from '@/lib/db/agents'
import type { Project } from '@/lib/db'

type ProviderType = 'claude' | 'codex' | 'gemini' | 'ollama'

const PROVIDER_FILE: Record<ProviderType, string | null> = {
  claude: 'CLAUDE.md',
  codex:  'AGENTS.md',
  gemini: 'GEMINI.md',
  ollama: null,
}

export function writeInstructions(agent: Agent, project: Project, providerType: ProviderType): void {
  const fileName = PROVIDER_FILE[providerType]
  if (!fileName) return

  const instructionsFile = path.join(project.path, agent.instructions_path ?? '', 'instructions.md')
  let content = ''
  try {
    content = fs.readFileSync(instructionsFile, 'utf8')
  } catch {
    // No instructions file — write empty
  }

  const dest = path.join(project.path, fileName)
  fs.writeFileSync(dest, content, 'utf8')
}

export function deleteInstructions(project: Project, providerType: string): void {
  const fileName = PROVIDER_FILE[providerType as ProviderType]
  if (!fileName) return
  const dest = path.join(project.path, fileName)
  try { fs.unlinkSync(dest) } catch {}
}
