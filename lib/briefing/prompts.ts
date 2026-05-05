import type { BriefingSections } from './sectionSignature'

export function buildBriefingPrompt(sections: BriefingSections): string {
  const data = {
    next_actions: sections.openNextActions.map(x => ({ refId: x.sessionId, projectName: x.projectName, label: x.sessionLabel, actions: x.actions })),
    critic_flagged: sections.criticFlagged.map(x => ({ refId: String(x.findingId), projectName: x.projectName, kind: x.kind, severity: x.severity, message: x.message.slice(0, 200) })),
    top_tasks: sections.topTasks.map(x => ({ refId: x.taskId, projectName: x.projectName, status: x.status, title: x.title })),
    recent_failures: sections.recentFailures.map(x => ({ refId: x.sessionId, projectName: x.projectName, label: x.sessionLabel, grade: x.grade, reason: x.gradeReason })),
    duplicate_tasks: sections.duplicateTasks.map(x => ({ refId: `${x.aTaskId}::${x.bTaskId}`, projectName: x.projectName, similarity: x.similarity })),
  }
  return `You are the user's morning briefing assistant for a software project. You receive five sections of signal aggregated from the last few days of work. Your job is to write a brief prioritisation that helps the user decide where to focus today.

Output strict JSON with this shape:
{
  "narrative": "3-5 sentence prose summary prioritising the most important items.",
  "priority_actions": [
    { "sectionKey": "next_actions" | "critic_flagged" | "top_tasks" | "recent_failures" | "duplicate_tasks",
      "refId": "the item's id from the data below",
      "reason": "1-2 sentence rationale" }
  ]
}

Aim for 3-5 priority_actions across sections. Do not include any text outside the JSON. Do not invent ids — only use ones present in the data.

DATA:
${JSON.stringify(data, null, 2)}
`
}
