import type { AppEvent } from './events'

export type TimelineEntry = {
  projectId: string | null
  projectName: string
  featureName: string
  events: Array<{
    type: string
    summary: string
    timestamp: string
  }>
}

export function buildTimeline(events: AppEvent[], projectNames: Map<string, string>): TimelineEntry[] {
  // Group events by feature (derived from summary)
  const featureMap = new Map<string, TimelineEntry>()

  for (const event of events) {
    // Try to extract feature name from event summary
    const projectName = event.projectId ? (projectNames.get(event.projectId) ?? 'Unknown') : 'System'

    // Use event type + project as grouping key
    const key = `${event.projectId ?? 'system'}`

    if (!featureMap.has(key)) {
      featureMap.set(key, {
        projectId: event.projectId,
        projectName,
        featureName: projectName,
        events: [],
      })
    }

    featureMap.get(key)!.events.push({
      type: event.type,
      summary: event.summary,
      timestamp: event.createdAt,
    })
  }

  // Sort entries by most recent event
  const entries = Array.from(featureMap.values())
  entries.sort((a, b) => {
    const aLatest = a.events[0]?.timestamp ?? ''
    const bLatest = b.events[0]?.timestamp ?? ''
    return bLatest.localeCompare(aLatest)
  })

  return entries
}
