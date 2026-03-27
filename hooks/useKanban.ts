import { useMemo } from 'react'
import type { DashboardResponse } from '@/lib/dashboard'

export type KanbanCard = {
  projectId: string
  projectName: string
  featureName: string
  filePath: string
  auditStatus: string | null
  stale: boolean
}

export type KanbanColumns = {
  ideas: KanbanCard[]
  specs: KanbanCard[]
  plans: KanbanCard[]
  inProgress: KanbanCard[]
}

export function useKanban(data: DashboardResponse | undefined): KanbanColumns {
  return useMemo(() => {
    if (!data) return { ideas: [], specs: [], plans: [], inProgress: [] }

    const ideas: KanbanCard[] = []
    const specs: KanbanCard[] = []
    const plans: KanbanCard[] = []
    const inProgress: KanbanCard[] = []

    for (const item of data.upNext) {
      const card: KanbanCard = {
        projectId: item.projectId,
        projectName: item.projectName,
        featureName: item.featureName,
        filePath: item.filePath,
        auditStatus: item.auditStatus,
        stale: item.stale,
      }
      if (item.stage === 'spec') ideas.push(card)
      else if (item.stage === 'plan') specs.push(card)
      else if (item.stage === 'develop') plans.push(card)
    }

    for (const item of data.inProgress) {
      inProgress.push({
        projectId: item.projectId,
        projectName: item.projectName,
        featureName: item.featureName,
        filePath: item.sourceFile,
        auditStatus: null,
        stale: false,
      })
    }

    return { ideas, specs, plans, inProgress }
  }, [data])
}
