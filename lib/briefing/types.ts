// lib/briefing/types.ts
export type BriefingNextAction = {
  sessionId: string
  sessionLabel: string
  projectId: string
  projectName: string
  taskId: string | null
  sourceFile: string | null
  endedAt: string
  actions: string[]
  openQuestions: string[]
}

export type BriefingCriticFlag = {
  projectId: string
  projectName: string
  kind: string
  ref: string
  severity: 'critical' | 'high'
  category: string
  message: string
  createdAt: string
}

export type BriefingTopTask = {
  taskId: string
  projectId: string
  projectName: string
  title: string
  status: string
  createdAt: string
}

export type BriefingRecentFailure = {
  sessionId: string
  sessionLabel: string
  projectId: string
  projectName: string
  grade: 'no' | 'partial'
  gradeReason: string | null
  gradedAt: string
}

export type BriefingDuplicate = {
  aTaskId: string
  bTaskId: string
  aTitle: string
  bTitle: string
  projectId: string
  projectName: string
  similarity: number
}

export type Briefing = {
  openNextActions: BriefingNextAction[]
  criticFlagged: BriefingCriticFlag[]
  topTasks: BriefingTopTask[]
  recentFailures: BriefingRecentFailure[]
  duplicateTasks: BriefingDuplicate[]
  generatedAt: string
}
