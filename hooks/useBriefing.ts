'use client'
import useSWR from 'swr'
import type { BriefingResponse } from '@/lib/briefing/types'

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`briefing fetch failed: ${res.status}`)
  return res.json() as Promise<BriefingResponse>
}

export function useBriefing(projectId?: string) {
  const url = projectId ? `/api/briefing?projectId=${encodeURIComponent(projectId)}` : '/api/briefing'
  return useSWR<BriefingResponse>(url, fetcher, {
    refreshInterval: (latest) => {
      if (latest && latest.snapshot === null && latest.snapshotStale) return 5_000
      return 60_000
    },
    revalidateOnFocus: true,
  })
}

// Re-export for component imports
export type { BriefingResponse }
