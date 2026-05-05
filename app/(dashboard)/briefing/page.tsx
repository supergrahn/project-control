'use client'
import { Suspense } from 'react'
import { BriefingPage } from '@/components/briefing/BriefingPage'

export default function BriefingRoute() {
  return (
    <Suspense fallback={<p className="text-text-muted text-sm">Loading…</p>}>
      <BriefingPage />
    </Suspense>
  )
}
