'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings } from 'lucide-react'
import { ProjectTabs } from './ProjectTabs'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/' },
  { label: 'Ideas', href: '/ideas' },
  { label: 'Specs', href: '/specs' },
  { label: 'Plans', href: '/plans' },
  { label: 'Developing', href: '/developing' },
  { label: 'Memory', href: '/memory' },
]

export function TopNav() {
  const pathname = usePathname()

  return (
    <header className="border-b border-zinc-800 bg-zinc-950">
      <div className="h-11 flex items-center gap-4 px-4">
        <span className="font-bold text-violet-400 text-sm shrink-0">⬡ Project Control</span>
        <nav className="flex gap-1 ml-2">
          {NAV_ITEMS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                (t.href === '/' ? pathname === '/' : pathname.startsWith(t.href))
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
      </div>
      <ProjectTabs />
    </header>
  )
}
