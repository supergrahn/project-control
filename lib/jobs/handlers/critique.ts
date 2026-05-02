import type { Database } from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { localComplete, getLocalModelName } from '@/lib/router/localComplete'
import { getDefaultLocalProvider } from '@/lib/db/providers'

export type CritiquePayload = {
  project_id: string
  ref: string                  // relative path
  kind: 'spec' | 'plan'
  content_hash: string
}

type Issue = {
  severity: 'critical' | 'important' | 'minor'
  category: string
  message: string
  line_hint?: number | null
}

const PROMPT = (kind: 'spec' | 'plan', content: string) => `
You are reviewing a ${kind} document. Identify issues using this rubric:

CRITICAL (block ship):
- Placeholder text ("TODO", "TBD", "fill in")
- Internal contradictions
- Missing required sections (Goal, Architecture, Failure modes for specs; Tasks, Steps, Tests for plans)
- Type/property/file-path drift between sections

IMPORTANT (should fix):
- Ambiguity an implementer would interpret two ways
- Tests that don't actually pin the claimed behavior
- Missing prerequisites between tasks

MINOR:
- Style inconsistencies
- Unclear naming

Return ONLY a JSON object:
{
  "issues": [
    { "severity": "critical" | "important" | "minor", "category": "<short tag>", "message": "<one sentence>", "line_hint": <line number or null> }
  ]
}

Document:
${content}
`.trim()

function dedupKeyForIssue(issue: Issue): string {
  return `${issue.severity}|${issue.category}|${issue.message.slice(0, 50)}`
}

export async function handleCritique(db: Database, payload: CritiquePayload): Promise<void> {
  const provider = getDefaultLocalProvider(db)
  if (!provider) { console.warn('[critique] no local provider'); return }

  const project = db.prepare(`SELECT path FROM projects WHERE id = ?`).get(payload.project_id) as { path: string } | undefined
  if (!project) return
  const filePath = join(project.path, payload.ref)
  let content: string
  try { content = readFileSync(filePath, 'utf8') } catch { console.warn(`[critique] file gone: ${filePath}`); return }
  const currentHash = createHash('sha256').update(content).digest('hex')
  if (currentHash !== payload.content_hash) { console.warn('[critique] hash drift; skipping'); return }

  const prompt = PROMPT(payload.kind, content)
  const issuesByKey = new Map<string, { issue: Issue; votes: number }>()

  const temps = [0.0, 0.2, 0.4]
  let successfulRuns = 0
  for (const _t of temps) {
    try {
      const raw = await localComplete(provider, prompt, { maxTokens: 2000, timeoutMs: 60_000 })
      const parsed = JSON.parse(raw) as { issues?: Issue[] }
      successfulRuns++
      for (const issue of parsed.issues ?? []) {
        const key = dedupKeyForIssue(issue)
        const existing = issuesByKey.get(key)
        if (existing) existing.votes++
        else issuesByKey.set(key, { issue, votes: 1 })
      }
    } catch (err) {
      console.warn(`[critique] run failed:`, err)
    }
  }

  if (successfulRuns === 0) throw new Error('critique: all runs failed')

  // Majority vote: issues with votes >= 2 (or >= 1 if only one run succeeded)
  const minVotes = successfulRuns >= 2 ? 2 : 1
  const merged: Issue[] = Array.from(issuesByKey.values())
    .filter(e => e.votes >= minVotes)
    .map(e => e.issue)

  const findings = {
    issues: merged,
    votes: successfulRuns,
    model: getLocalModelName(provider),
    run_at: new Date().toISOString(),
  }

  db.prepare(`
    INSERT INTO critic_findings (project_id, kind, ref, content_hash, findings, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, kind, ref) DO UPDATE SET
      content_hash = excluded.content_hash,
      findings = excluded.findings,
      created_at = excluded.created_at
  `).run(payload.project_id, payload.kind, payload.ref, currentHash, JSON.stringify(findings), new Date().toISOString())
}
