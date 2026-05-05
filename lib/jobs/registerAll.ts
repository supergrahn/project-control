import { registerHandler } from './runner'
import { handleEmbed } from './handlers/embed'
import { handleGradeSession } from './handlers/grade_session'
import { handleExtractNextActions } from './handlers/extract_next_actions'
import { handleRefreshPrep } from './handlers/refresh_prep'
import { handleCritique } from './handlers/critique'
import { handleBriefingSynthesize } from './handlers/briefing_synthesize'

/**
 * Register all reflective-workflow handlers on the runner. Idempotent (the
 * runner replaces existing entries by kind), but intended to be invoked once
 * at server startup.
 */
export function registerAllHandlers(): void {
  registerHandler('embed', handleEmbed as never)
  registerHandler('grade_session', handleGradeSession as never)
  registerHandler('extract_next_actions', handleExtractNextActions as never)
  registerHandler('refresh_prep', handleRefreshPrep as never)
  registerHandler('critique_spec', (db, payload) =>
    handleCritique(db, { ...(payload as Record<string, unknown>), kind: 'spec' } as never),
  )
  registerHandler('critique_plan', (db, payload) =>
    handleCritique(db, { ...(payload as Record<string, unknown>), kind: 'plan' } as never),
  )
  registerHandler('briefing_synthesize', handleBriefingSynthesize as never)
}
