import { execFileSync } from 'child_process'
import type { Project } from './db'

export function getGitDiff(projectPath: string): string | null {
  try {
    const staged = execFileSync('git', ['-C', projectPath, 'diff', '--cached'], {
      encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    const unstaged = execFileSync('git', ['-C', projectPath, 'diff'], {
      encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    const combined = [staged, unstaged].filter(Boolean).join('\n')
    return combined || null
  } catch { return null }
}

export type ProjectGitActivity = {
  projectId: string
  projectName: string
  currentBranch: string | null
  recentCommits: string[]
  uncommittedChanges: number
  lastCommitDate: string | null
}

function gitExec(projectPath: string, args: string[]): string | null {
  try {
    return execFileSync('git', ['-C', projectPath, ...args], {
      encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim() || null
  } catch { return null }
}

export function scanGitActivity(projects: Project[]): ProjectGitActivity[] {
  const results: ProjectGitActivity[] = []

  for (const project of projects) {
    const branch = gitExec(project.path, ['branch', '--show-current'])
    const log = gitExec(project.path, ['log', '--oneline', '-5'])
    const status = gitExec(project.path, ['status', '--short'])
    const lastDate = gitExec(project.path, ['log', '-1', '--format=%aI'])

    results.push({
      projectId: project.id,
      projectName: project.name,
      currentBranch: branch,
      recentCommits: log ? log.split('\n').filter(Boolean) : [],
      uncommittedChanges: status ? status.split('\n').filter(Boolean).length : 0,
      lastCommitDate: lastDate,
    })
  }

  // Sort: projects with uncommitted changes first, then by last commit date desc
  results.sort((a, b) => {
    if (a.uncommittedChanges > 0 && b.uncommittedChanges === 0) return -1
    if (a.uncommittedChanges === 0 && b.uncommittedChanges > 0) return 1
    if (a.lastCommitDate && b.lastCommitDate) return b.lastCommitDate.localeCompare(a.lastCommitDate)
    return 0
  })

  return results
}
