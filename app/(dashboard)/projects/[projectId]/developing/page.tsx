'use client'
import { useState } from 'react'
import { DevelopingView } from '@/components/DevelopingView'
import { SessionModal } from '@/components/SessionModal'
import type { Session } from '@/hooks/useSessions'

export default function DevelopingPage() {
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  return (
    <>
      <DevelopingView onOpenSession={setActiveSession} />
      <SessionModal session={activeSession} onClose={() => setActiveSession(null)} />
    </>
  )
}
