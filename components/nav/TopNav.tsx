'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings } from 'lucide-react'
import { ProjectPicker } from './ProjectPicker'
import { useProjectStore } from '@/hooks/useProjects'

const TABS = [
  { label: 'Ideas', href: '/ideas' },
  { label: 'Specs', href: '/specs' },
  { label: 'Plans', href: '/plans' },
  { label: 'Developing', href: '/developing' },
]

export function TopNav() {
  const pathname = usePathname()
  const { selectedProject, setSelectedProject } = useProjectStore()

  return (
    <header className="h-12 flex items-center gap-4 px-4 border-b border-zinc-800 bg-zinc-950">
      <span className="font-bold text-violet-400 text-sm">⬡ Project Control</span>
      <ProjectPicker selected={selectedProject} onSelect={setSelectedProject} />
      <nav className="flex gap-1 ml-4">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              pathname.startsWith(t.href)
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto">
        <Link href="/settings" className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300">
          <Settings size={16} />
        </Link>
      </div>
    </header>
  )
}
