type SectionKey = 'next_actions' | 'critic_flagged' | 'top_tasks' | 'recent_failures' | 'duplicate_tasks'
const VALID_SECTIONS = new Set<SectionKey>(['next_actions', 'critic_flagged', 'top_tasks', 'recent_failures', 'duplicate_tasks'])

export type ParsedBriefing = {
  narrative: string
  priorityActions: Array<{ sectionKey: SectionKey; refId: string; reason: string }>
}

export function parseBriefingJson(raw: string, validRefIdsBySection?: Record<SectionKey, Set<string>>): ParsedBriefing | null {
  let parsed: unknown = null
  try { parsed = JSON.parse(raw) } catch { /* fall through */ }
  if (!parsed) {
    // Salvage: substring from first { to last }
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) return null
    try { parsed = JSON.parse(raw.slice(start, end + 1)) } catch { return null }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const obj = parsed as { narrative?: unknown; priority_actions?: unknown }
  const narrative = typeof obj.narrative === 'string' && obj.narrative.length > 0 ? obj.narrative : null
  if (narrative === null) return null
  const rawActions = Array.isArray(obj.priority_actions) ? obj.priority_actions : []

  const priorityActions: ParsedBriefing['priorityActions'] = []
  for (const a of rawActions) {
    if (!a || typeof a !== 'object') continue
    const sectionKey = (a as { sectionKey?: unknown }).sectionKey
    const refId = (a as { refId?: unknown }).refId
    const reason = (a as { reason?: unknown }).reason
    if (typeof sectionKey !== 'string' || !VALID_SECTIONS.has(sectionKey as SectionKey)) continue
    if (typeof refId !== 'string' || refId.length === 0) continue
    if (typeof reason !== 'string' || reason.length === 0) continue
    if (validRefIdsBySection) {
      const validSet = validRefIdsBySection[sectionKey as SectionKey]
      if (validSet && !validSet.has(refId)) continue
    }
    priorityActions.push({ sectionKey: sectionKey as SectionKey, refId, reason })
    if (priorityActions.length >= 6) break
  }
  return { narrative, priorityActions }
}
