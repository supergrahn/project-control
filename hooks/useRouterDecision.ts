import { useQuery } from '@tanstack/react-query'

export type RouterDecisionResponse = {
  decision: {
    id: string
    picked_provider: string
    phase: string
    complexity: string
    score_breakdown: {
      suitability: number
      cost: number
      success_rate_blended: number
      n_observed: number
      total: number
      considered: Array<{ providerId: string; providerName: string; score: number }>
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
