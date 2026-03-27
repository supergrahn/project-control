import { NextResponse } from 'next/server'
import { getDb, getProposedActionsForSession, dismissProposedAction } from '@/lib/db'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; actionId: string }> }
) {
  const { id: sessionId, actionId } = await params
  const db = getDb()
  const all = getProposedActionsForSession(db, sessionId)
  const action = all.find(a => a.id === actionId)
  if (!action) return NextResponse.json({ error: 'Action not found' }, { status: 404 })

  // Execute action based on type
  switch (action.action_type) {
    case 'advance':
      // Trigger advance via orchestrator tools
      try {
        const { advancePhase } = await import('@/server/orchestrator-tools')
        await advancePhase(sessionId)
      } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 })
      }
      break
    case 'run_audit':
      // Client handles this by navigating to plans page
      break
    case 'skip':
    case 'archive':
    case 'custom':
      break // dismiss only
  }

  dismissProposedAction(db, actionId)
  return NextResponse.json({ ok: true })
}
