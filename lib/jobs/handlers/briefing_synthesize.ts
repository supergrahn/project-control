import type { Database } from 'better-sqlite3'

export type BriefingSynthesizePayload = { scope: string }

export async function handleBriefingSynthesize(db: Database, payload: BriefingSynthesizePayload): Promise<void> {
  // Implementation in Task 5 — this stub exists so registerAll.ts compiles.
  console.log(`[briefing_synthesize] stub called for scope=${payload.scope}`)
}
