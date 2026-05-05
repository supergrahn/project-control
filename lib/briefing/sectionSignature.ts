import { createHash } from 'crypto'
import type { BriefingNextAction, BriefingCriticFlag, BriefingTopTask, BriefingRecentFailure, BriefingDuplicate } from './types'

export type BriefingSections = {
  openNextActions: BriefingNextAction[]
  criticFlagged: BriefingCriticFlag[]
  topTasks: BriefingTopTask[]
  recentFailures: BriefingRecentFailure[]
  duplicateTasks: BriefingDuplicate[]
}

export function sectionSignature(s: BriefingSections): string {
  const ids = {
    next: s.openNextActions.map(x => x.sessionId).sort(),
    critic: s.criticFlagged.map(x => `${x.kind}:${x.ref}:${x.severity}:${x.message.slice(0, 40)}`).sort(),
    top: s.topTasks.map(x => x.taskId).sort(),
    fail: s.recentFailures.map(x => x.sessionId).sort(),
    dup: s.duplicateTasks.map(x => `${x.aTaskId}::${x.bTaskId}`).sort(),
  }
  return createHash('sha256').update(JSON.stringify(ids)).digest('hex')
}
