import { execFileSync } from 'child_process'

export function getGitHistory(projectPath: string, count: number = 5): string | null {
  try {
    const output = execFileSync(
      'git',
      ['-C', projectPath, 'log', '--oneline', `-${count}`],
      { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim()
    return output || null
  } catch {
    return null
  }
}

export function getGitStatus(projectPath: string): string | null {
  try {
    const output = execFileSync(
      'git',
      ['-C', projectPath, 'status', '--short'],
      { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim()
    return output || null
  } catch {
    return null
  }
}
