'use client'
import useSWR from 'swr'
import type { Briefing } from '@/lib/briefing/types'

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`briefing fetch failed: ${res.status}`)
  return res.json() as Promise<Briefing>
}

export function useBriefing() {
  return useSWR<Briefing>('/api/briefing', fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  })
}
