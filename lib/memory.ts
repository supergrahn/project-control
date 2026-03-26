// lib/memory.ts
import fs from 'fs'
import path from 'path'
import os from 'os'

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

export type MemoryFile = {
  filename: string
  path: string
  name: string
  description: string
  type: MemoryType
  content: string
  modifiedAt: string
}

const TYPE_ORDER: MemoryType[] = ['project', 'feedback', 'user', 'reference']

export function encodeProjectPath(projectPath: string): string {
  return projectPath.replace(/\//g, '-')
}

function inferType(filename: string): MemoryType {
  for (const t of TYPE_ORDER) {
    if (filename.startsWith(t + '_') || filename.startsWith(t + '.')) return t
  }
  return 'project'
}

// modifiedAt is passed in so this function is pure and testable without touching disk
export function parseMemoryFile(filename: string, filePath: string, content: string, modifiedAt: string): MemoryFile {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  let name = ''
  let description = ''
  let type: MemoryType = inferType(filename)

  if (fmMatch) {
    const fm = fmMatch[1]
    name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? ''
    description = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? ''
    const rawType = fm.match(/^type:\s*(.+)$/m)?.[1]?.trim()
    if (rawType && TYPE_ORDER.includes(rawType as MemoryType)) {
      type = rawType as MemoryType
    }
  }

  if (!name) name = path.basename(filename, '.md')

  return { filename, path: filePath, name, description, type, content, modifiedAt }
}

export function resolveMemoryDir(projectPath: string, claudeProjectsBase?: string): string | null {
  const base = claudeProjectsBase ?? path.join(os.homedir(), '.claude', 'projects')
  const encoded = encodeProjectPath(projectPath)
  const expected = path.join(base, encoded, 'memory')

  if (fs.existsSync(expected)) return expected

  // Fallback: scan all subdirs for closest match
  if (!fs.existsSync(base)) return null
  const entries = fs.readdirSync(base, { withFileTypes: true })
  let bestMatch: string | null = null
  let bestScore = Infinity

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const memDir = path.join(base, entry.name, 'memory')
    if (!fs.existsSync(memDir)) continue
    const dist = levenshtein(entry.name, encoded)
    if (dist < bestScore && dist <= 3) {
      bestScore = dist
      bestMatch = memDir
    }
  }

  return bestMatch
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

export function listMemoryFiles(memoryDir: string): MemoryFile[] {
  if (!fs.existsSync(memoryDir)) return []

  const files: MemoryFile[] = []
  for (const f of fs.readdirSync(memoryDir)) {
    if (!f.endsWith('.md') || f === 'MEMORY.md') continue
    try {
      const filePath = path.join(memoryDir, f)
      const content = fs.readFileSync(filePath, 'utf8')
      const modifiedAt = fs.statSync(filePath).mtime.toISOString()
      files.push(parseMemoryFile(f, filePath, content, modifiedAt))
    } catch {
      // skip unreadable files
    }
  }

  return files.sort((a, b) => {
    const ta = TYPE_ORDER.indexOf(a.type)
    const tb = TYPE_ORDER.indexOf(b.type)
    if (ta !== tb) return ta - tb
    return b.modifiedAt.localeCompare(a.modifiedAt)
  })
}
