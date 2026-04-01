import useSWR, { mutate as globalMutate } from 'swr'
import type { Task, TaskStatus, UpdateTaskInput } from '@/lib/db/tasks'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function useTasks(projectId: string, status?: TaskStatus) {
  const url = status
    ? `/api/tasks?projectId=${projectId}&status=${status}`
    : `/api/tasks?projectId=${projectId}`
  const { data, error, isLoading } = useSWR<Task[]>(projectId ? url : null, fetcher, {
    refreshInterval: 5000,
  })
  return { tasks: data ?? [], error, isLoading }
}

export function useTask(taskId: string | null) {
  const { data, error, isLoading } = useSWR<Task>(
    taskId ? `/api/tasks/${taskId}` : null,
    fetcher,
    { refreshInterval: 3000 }
  )
  return { task: data, error, isLoading }
}

export async function createTask(
  projectId: string,
  title: string,
  notes?: string,
  options?: { priority?: string; labels?: string[]; assignee_agent_id?: string | null }
): Promise<Task> {
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, title, notes, ...options }),
  })
  if (!res.ok) throw new Error('Failed to create task')
  const task = await res.json()
  await globalMutate(`/api/tasks?projectId=${projectId}`)
  return task
}

export async function deleteTask(taskId: string, projectId: string): Promise<void> {
  const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete task')
  await globalMutate((key: unknown) => typeof key === 'string' && key.startsWith('/api/tasks?projectId='))
}

export async function patchTask(taskId: string, input: Partial<UpdateTaskInput> & { status?: TaskStatus }): Promise<Task> {
  const res = await fetch(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error('Failed to update task')
  const task = await res.json()
  await globalMutate(`/api/tasks/${taskId}`)
  await globalMutate((key: unknown) => typeof key === 'string' && key.startsWith('/api/tasks?projectId='))
  return task
}
