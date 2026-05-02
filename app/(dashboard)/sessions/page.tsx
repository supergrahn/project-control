'use client'
import { Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSessions } from '@/hooks/useSessions'
import { SessionsHeader } from '@/components/sessions/SessionsHeader'
import { SessionsGrid } from '@/components/sessions/SessionsGrid'
import { SessionDetailDrawer } from '@/components/sessions/SessionDetailDrawer'

type StatusFilter = 'active' | 'ended' | 'all'

const EMPTY_COPY: Record<StatusFilter, string> = {
  active: "No active sessions yet — start one from a project's pipeline page.",
  ended: 'No ended sessions.',
  all: 'No sessions yet.',
}

function SessionsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const status = (searchParams.get('status') ?? 'active') as StatusFilter
  const selectedId = searchParams.get('selected')

  // Always fetch with 'all' to avoid filter-change race
  const { data: sessions = [], isLoading } = useSessions({ status: 'all' })

  const filtered = useMemo(() => {
    if (status === 'active') return sessions.filter(s => !s.ended_at)
    if (status === 'ended') return sessions.filter(s => s.ended_at)
    return sessions
  }, [sessions, status])

  const selected = filtered.find(s => s.id === selectedId) ?? null

  function setStatus(next: StatusFilter) {
    const sp = new URLSearchParams(searchParams.toString())
    sp.set('status', next)
    const stillVisible = selectedId && sessions.some(s =>
      s.id === selectedId &&
      (next === 'all' || (next === 'active' && !s.ended_at) || (next === 'ended' && s.ended_at))
    )
    if (!stillVisible) sp.delete('selected')
    router.replace(`/sessions?${sp.toString()}`)
  }

  function setSelected(id: string | null) {
    const sp = new URLSearchParams(searchParams.toString())
    if (id) sp.set('selected', id); else sp.delete('selected')
    router.replace(`/sessions?${sp.toString()}`)
  }

  return (
    <>
      <SessionsHeader status={status} onStatusChange={setStatus} filteredCount={filtered.length} />
      <SessionsGrid
        sessions={filtered}
        isLoading={isLoading}
        selectedId={selectedId}
        onSelect={setSelected}
        emptyMessage={EMPTY_COPY[status]}
      />
      {selected && (
        <SessionDetailDrawer
          session={selected}
          sessions={filtered}
          onClose={() => setSelected(null)}
          onNavigate={(s) => setSelected(s.id)}
        />
      )}
    </>
  )
}

export default function SessionsPage() {
  return (
    <Suspense fallback={<p className="text-text-muted text-sm">Loading sessions…</p>}>
      <SessionsPageContent />
    </Suspense>
  )
}
