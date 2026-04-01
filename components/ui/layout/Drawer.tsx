'use client'
import { useEffect } from 'react'

type DrawerProps = {
  open: boolean
  onClose: () => void
  title?: string
  width?: 'sm' | 'md' | 'lg'
  side?: 'left' | 'right'
  children: React.ReactNode
}

const WIDTH_CLASSES = {
  sm: 'w-[210px]',
  md: 'w-[260px]',
  lg: 'w-[420px]',
}

export function Drawer({ open, onClose, title, width = 'md', side = 'right', children }: DrawerProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const sideClass = side === 'right' ? 'right-0 border-l' : 'left-0 border-r'

  return (
    <div className={`fixed top-0 bottom-0 ${sideClass} border-border-default bg-bg-base ${WIDTH_CLASSES[width]} z-40 flex flex-col overflow-hidden`}>
      {title && (
        <div className="px-4 py-3 border-b border-border-default">
          <span className="text-[12px] font-semibold text-text-secondary uppercase tracking-wide">{title}</span>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4">
        {children}
      </div>
    </div>
  )
}
