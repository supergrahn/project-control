import { spawn } from 'child_process'
import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import { randomUUID } from 'crypto'
import type { Insight } from './db'

function resolveClaude(): string {
  const candidates = [
    `${os.homedir()}/.local/bin/claude`,
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return execSync('which claude', { encoding: 'utf8' }).trim()
}

export async function extractInsights(opts: {
  debriefContent: string
  projectId: string
  sessionId: string | null
  projectPath: string
}): Promise<Insight[]> {
  const prompt = `Extract key insights from this session debrief. Return a JSON array of objects with these fields:
- category: "decision" | "pattern" | "warning" | "learning"
- title: one-line summary (max 80 chars)
- detail: 2-3 sentences explaining the insight
- tags: array of 2-4 lowercase keywords

Only extract genuinely useful insights — skip trivial observations. Return 0-5 insights max.

Respond ONLY with the JSON array, no other text.

Debrief:
${opts.debriefContent}`

  try {
    const claudeBin = resolveClaude()
    const result = await new Promise<string>((resolve, reject) => {
      let stdout = ''
      const proc = spawn(claudeBin, ['--print', '--output-format', 'text'], {
        cwd: opts.projectPath,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      if (!proc.stdin) return reject(new Error('stdin not available'))
      proc.stdin.write(prompt)
      proc.stdin.end()
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
      proc.on('close', (code) => { if (code !== 0) reject(new Error('failed')); else resolve(stdout) })
      proc.on('error', reject)
    })

    // Parse JSON from response (might have markdown code fences)
    const jsonStr = result.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    const raw = JSON.parse(jsonStr) as Array<{ category: string; title: string; detail: string; tags: string[] }>

    return raw.map(r => ({
      id: randomUUID(),
      project_id: opts.projectId,
      session_id: opts.sessionId,
      category: r.category,
      title: r.title,
      detail: r.detail,
      tags: JSON.stringify(r.tags),
      created_at: new Date().toISOString(),
    }))
  } catch {
    return []
  }
}
