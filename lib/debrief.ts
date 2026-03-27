import { spawn } from 'child_process'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

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

export async function generateDebrief(opts: {
  outputBuffer: string[]
  sessionLabel: string
  phase: string
  sourceFile: string | null
  projectPath: string
}): Promise<string | null> {
  const output = opts.outputBuffer.join('\n').slice(-8000) // last 8k chars
  if (output.trim().length < 100) return null // too short to debrief

  const prompt = `You are generating a post-session debrief. Analyze the terminal output below and produce a structured markdown summary.

Format:
# Session Debrief: ${opts.sessionLabel}

## Completed
- List what was accomplished

## Pending
- List what remains to be done

## Key Decisions
- List important technical decisions made

## Files Changed
- List files that were created or modified

---

Terminal output (last portion):
${output}`

  try {
    const claudeBin = resolveClaude()
    const result = await new Promise<string>((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      const proc = spawn(claudeBin, ['--print', '--output-format', 'text'], {
        cwd: opts.projectPath,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      if (!proc.stdin) return reject(new Error('stdin not available'))
      proc.stdin.write(prompt)
      proc.stdin.end()
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
      proc.on('close', (code) => {
        if (code !== 0) reject(new Error(`claude exited ${code}: ${stderr}`))
        else resolve(stdout)
      })
      proc.on('error', reject)
    })

    // Add frontmatter
    const frontmatter = `---\nphase: ${opts.phase}\nsource_file: ${opts.sourceFile ?? 'none'}\ncreated_at: ${new Date().toISOString()}\n---\n\n`

    // Save to project
    const debriefDir = path.join(opts.projectPath, 'docs', 'debriefs')
    fs.mkdirSync(debriefDir, { recursive: true })
    const slug = opts.sessionLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    const date = new Date().toISOString().slice(0, 10)
    const filePath = path.join(debriefDir, `${slug}-${date}.md`)
    fs.writeFileSync(filePath, frontmatter + result, 'utf8')

    return filePath
  } catch {
    return null
  }
}
