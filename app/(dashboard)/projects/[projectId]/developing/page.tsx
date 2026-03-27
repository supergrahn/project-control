'use client'
import { DevelopingView } from '@/components/DevelopingView'
import { useSessionWindows } from '@/hooks/useSessionWindows'
import type { Session } from '@/hooks/useSessions'

export default function DevelopingPage() {
  const { openWindow } = useSessionWindows()

  function handleOpenSession(session: Session) {
    openWindow(session)
  }

  return <DevelopingView onOpenSession={handleOpenSession} />
}
