'use client'
import useSWR from 'swr'
import { AlertTriangle } from 'lucide-react'

type Issue = {
  severity: 'critical' | 'important' | 'minor'
  category: string
  message: string
  line_hint?: number | null
}

type FindingsPayload = {
  issues: Issue[]
  votes: number
  model: string
  run_at: string
}

type ApiResponse = {
  findings: FindingsPayload
  content_hash: string
} | null

type Props = {
  projectId: string
  // The relative path of the spec/plan markdown file. Named docRef to avoid
  // colliding with React's reserved `ref` prop name.
  docRef: string
  // Hash of the currently rendered file contents. When this differs from the
  // stored content_hash, the panel marks the findings as stale (the critic is
  // expected to re-run on next embed/critique tick).
  currentHash: string
}

const fetcher = async (url: string): Promise<ApiResponse> => {
  const r = await fetch(url)
  if (!r.ok) return null
  return r.json()
}

export function CriticFindingsPanel({ projectId, docRef, currentHash }: Props) {
  const { data } = useSWR<ApiResponse>(
    `/api/projects/${projectId}/critic-findings?ref=${encodeURIComponent(docRef)}`,
    fetcher,
  )
  if (!data || !data.findings) return null

  const issues = data.findings.issues ?? []
  if (issues.length === 0) return null

  const stale = !!currentHash && data.content_hash !== currentHash

  const counts = issues.reduce(
    (acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] ?? 0) + 1
      return acc
    },
    {} as Record<Issue['severity'], number>,
  )

  return (
    <div
      role="region"
      aria-label="Critic findings"
      className="mb-6 p-3 bg-bg-secondary border border-border-default rounded-[6px]"
    >
      <div className="flex items-center gap-3 text-xs">
        <AlertTriangle className="w-3.5 h-3.5 text-accent-orange shrink-0" />
        <span className="text-accent-red font-semibold">{counts.critical ?? 0} critical</span>
        <span className="text-accent-orange font-semibold">{counts.important ?? 0} important</span>
        <span className="text-text-muted">{counts.minor ?? 0} minor</span>
        {stale && (
          <span className="ml-auto text-text-faint italic text-[10px]">Stale — re-running</span>
        )}
      </div>
      <ul className="mt-3 text-xs space-y-1.5">
        {issues.map((issue, i) => (
          <li
            key={i}
            className={
              issue.severity === 'critical'
                ? 'text-accent-red'
                : issue.severity === 'important'
                ? 'text-accent-orange'
                : 'text-text-muted'
            }
          >
            <span className="font-mono text-[10px] uppercase mr-1">{issue.severity}</span>
            <span className="font-semibold">{issue.category}:</span> {issue.message}
            {issue.line_hint != null && (
              <span className="text-text-faint"> (line {issue.line_hint})</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
