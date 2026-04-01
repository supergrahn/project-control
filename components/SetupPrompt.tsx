'use client'
import Link from 'next/link'
import { Settings } from 'lucide-react'

type Props = {
  dir: 'ideas' | 'specs' | 'plans'
}

const LABELS: Record<Props['dir'], string> = {
  ideas: 'ideas',
  specs: 'specs',
  plans: 'plans',
}

export function SetupPrompt({ dir }: Props) {
  return (
    <div className="rounded-lg border border-border-default bg-bg-primary/50 px-6 py-8 text-center max-w-sm mx-auto mt-8">
      <p className="text-text-secondary text-sm mb-1">
        No <span className="text-text-primary">{LABELS[dir]}</span> folder configured for this project.
      </p>
      <p className="text-text-faint text-xs mb-4">Set the folder path in project settings.</p>
      <Link
        href="/settings"
        className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-bg-secondary hover:bg-bg-tertiary text-text-primary rounded"
      >
        <Settings size={14} /> Open Settings
      </Link>
    </div>
  )
}
