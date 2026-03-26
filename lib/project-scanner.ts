import fs from 'fs'
import path from 'path'
import os from 'os'

export type ProjectFolder = { name: string; path: string }

export function getGitDir(): string {
  return path.join(os.homedir(), 'git')
}

export function scanGitDir(gitDir = getGitDir()): ProjectFolder[] {
  if (!fs.existsSync(gitDir)) return []
  return (fs.readdirSync(gitDir, { withFileTypes: true }) as fs.Dirent[])
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, path: path.join(gitDir, d.name) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
