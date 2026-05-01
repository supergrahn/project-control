import { useQuery } from '@tanstack/react-query'

// Decisions written by pickRoute include the full breakdown and considered list.
// Decisions written by the manual_retry endpoint
// (POST /api/sessions/:id/restart-with-route) only carry `{ source, providerId }`,
// so all the auto-router fields are optional from a consumer's perspective.
export type RouterDecisionResponse = {
  decision: {
    id: string
    picked_provider: string
    phase: string
    complexity: string
    score_breakdown: {
      suitability?: number
      cost?: number
      success_rate_blended?: number
      n_observed?: number
      total?: number
      considered?: Array<{ providerId: string; providerName: string; score: number }>
      source?: 'auto' | 'manual_retry'
      providerId?: string
    }
  } | null
}

export function useRouterDecision(sessionId: string | null) {
  return useQuery<RouterDecisionResponse>({
    queryKey: ['router-decision', sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/router/decisions?sessionId=${sessionId}`)
      if (!res.ok) throw new Error(`router decision fetch failed: ${res.statusText}`)
      return res.json() as Promise<RouterDecisionResponse>
    },
    enabled: !!sessionId,
  })
}
