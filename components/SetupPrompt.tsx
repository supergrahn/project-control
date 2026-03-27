'use client'
import Link from 'next/link'
import { Settings } from 'lucide-react'

type Props = {
  dir: 'ideas' | 'specs' | 'plans' | 'developing'
}

const LABELS: Record<Props['dir'], string> = {
  ideas: 'ideas',
  specs: 'specs',
  plans: 'plans',
  developing: 'developing',
}

export function SetupPrompt({ dir }: Props) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-6 py-8 text-center max-w-sm mx-auto mt-8">
      <p className="text-zinc-400 text-sm mb-1">
        No <span className="text-zinc-200">{LABELS[dir]}</span> folder configured for this project.
      </p>
      <p className="text-zinc-600 text-xs mb-4">Set the folder path in project settings.</p>
      <Link
        href="/settings"
        className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded"
      >
        <Settings size={14} /> Open Settings
      </Link>
    </div>
  )
}
