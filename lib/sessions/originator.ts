import type { Session } from '@/hooks/useSessions'

export type OriginatorLink = { label: string; href: string }

export type SessionOriginator =
  | { kind: 'task'; task: OriginatorLink; doc: OriginatorLink | null; taskId: string; sourceFile: string | null }
  | { kind: 'doc';  doc: OriginatorLink; sourceFile: string }
  | { kind: 'agent'; agent: OriginatorLink; agentId: string }
  | { kind: 'standalone' }

type SessionInput = Pick<Session, 'project_id' | 'source_file'> & {
  task_id?: string | null
  agent_id?: string | null
}

type Lookups = { tasks: Array<{ id: string; title: string }>; projectPath?: string }

function basename(p: string): string {
  const i = p.lastIndexOf('/')
  return i >= 0 ? p.slice(i + 1) : p
}

function toRelative(sourceFile: string, projectPath: string | undefined): string {
  if (!projectPath) return sourceFile
  const prefix = projectPath.endsWith('/') ? projectPath : projectPath + '/'
  return sourceFile.startsWith(prefix) ? sourceFile.slice(prefix.length) : sourceFile
}

function docLink(projectId: string, sourceFile: string, projectPath: string | undefined): OriginatorLink {
  const relative = toRelative(sourceFile, projectPath)
  return {
    label: basename(relative),
    href: `/projects/${projectId}/docs?file=${encodeURIComponent(relative)}`,
  }
}

export function getSessionOriginator(session: SessionInput, lookups: Lookups): SessionOriginator {
  const { project_id, source_file, task_id, agent_id } = session

  if (task_id) {
    const task = lookups.tasks.find(t => t.id === task_id)
    const taskLabel = task?.title ?? ('Task ' + task_id.slice(0, 8))
    return {
      kind: 'task',
      task: { label: taskLabel, href: `/projects/${project_id}/tasks/${task_id}` },
      doc: source_file ? docLink(project_id, source_file, lookups.projectPath) : null,
      taskId: task_id,
      sourceFile: source_file ?? null,
    }
  }
  if (source_file) {
    return {
      kind: 'doc',
      doc: docLink(project_id, source_file, lookups.projectPath),
      sourceFile: source_file,
    }
  }
  if (agent_id) {
    return {
      kind: 'agent',
      agent: { label: 'Agent', href: `/projects/${project_id}/agents/${agent_id}` },
      agentId: agent_id,
    }
  }
  return { kind: 'standalone' }
}
