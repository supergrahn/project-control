'use client'
import { useEffect, useState } from 'react'
import { TopNav } from '@/components/nav/TopNav'
import { ClaudeNotFound } from '@/components/ClaudeNotFound'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [claudeAvailable, setClaudeAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/sessions/health')
      .then((r) => r.json())
      .then((data) => setClaudeAvailable(data.claudeAvailable))
      .catch(() => setClaudeAvailable(false))
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <TopNav />
      {claudeAvailable === false && (
        <div className="px-4 pt-3">
          <ClaudeNotFound />
        </div>
      )}
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
