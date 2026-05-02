import type { Database } from 'better-sqlite3'

export function captureSessionSummary(db: Database, sessionId: string): void {
  try {
    const lastAssistant = db.prepare(`
      SELECT content FROM session_events
      WHERE session_id = ?
        AND role = 'assistant'
        AND content IS NOT NULL
        AND TRIM(content, X'20090A0D') != ''
      ORDER BY id DESC LIMIT 1
    `).get(sessionId) as { content: string } | undefined
    if (lastAssistant?.content) {
      db.prepare('UPDATE sessions SET summary = ? WHERE id = ?').run(lastAssistant.content, sessionId)
    }
  } catch (err) {
    console.warn('failed to capture session summary for', sessionId, err)
  }
}
