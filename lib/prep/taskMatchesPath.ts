import type { Task } from '@/lib/db/tasks'

function normalize(p: string): string {
  let n = p.trim()
  if (n.startsWith('./')) n = n.slice(2)
  return n
}

export function taskMatchesPath(task: Task, path: string): boolean {
  const target = normalize(path)
  const idea = task.idea_file
  if (idea) {
    const stripped = idea.replace(/^file:\/\//, '')
    if (normalize(stripped) === target) return true
    return false  // when idea_file is set, it's the canonical signal — don't fall back
  }
  if (task.prep_notes) {
    try {
      const notes = JSON.parse(task.prep_notes) as { files?: Array<{ path: string }> }
      const files = notes.files ?? []
      if (files.some(f => normalize(f.path) === target)) return true
    } catch {
      // malformed prep_notes → no match
    }
  }
  return false
}
