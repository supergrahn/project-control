'use client'
import useSWR from 'swr'

type SimilarMatch = { kind: string; ref: string; score: number }

type Props = {
  projectId: string
  taskId: string
  /**
   * Cosine threshold above which to display the hint. Defaults to 0.85 per
   * the slice spec — high enough to skip "vaguely related" matches but low
   * enough to catch genuine duplicates with paraphrased titles.
   */
  threshold?: number
}

const fetcher = async (key: [string, string, string]): Promise<SimilarMatch[]> => {
  const [, projectId, taskId] = key
  const res = await fetch(`/api/projects/${projectId}/embeddings/similar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'task',
      ref: taskId,
      resultKinds: ['task'],
      limit: 1,
    }),
  })
  if (!res.ok) return []
  return res.json()
}

/**
 * "Similar to" sublabel for a task card. Renders only when the top match for
 * the given task crosses the cosine threshold; otherwise the component
 * returns null and occupies no space. Pure suggestion — clicking navigates
 * to the similar task but performs no merge.
 */
export function DedupHint({ projectId, taskId, threshold = 0.85 }: Props) {
  const { data } = useSWR<SimilarMatch[]>(
    ['dedup-hint', projectId, taskId],
    fetcher,
    { dedupingInterval: 60_000 },
  )
  const top = data?.[0]
  if (!top || top.score < threshold) return null
  return (
    <a
      href={`/projects/${projectId}/tasks?selected=${top.ref}`}
      onClick={(e) => e.stopPropagation()}
      className="text-[10px] text-text-muted hover:text-accent-blue inline-block"
    >
      ↪ similar to: {top.ref.slice(0, 8)}
    </a>
  )
}
