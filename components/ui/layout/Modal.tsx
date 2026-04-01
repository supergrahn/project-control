'use client'
import { useEffect } from 'react'

type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: 'sm' | 'md' | 'lg'
  actions?: React.ReactNode
}

const WIDTH_CLASSES = {
  sm: 'w-[400px]',
  md: 'w-[520px]',
  lg: 'w-[640px]',
}

export function Modal({ open, onClose, title, children, width = 'md', actions }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-bg-overlay z-50 flex items-center justify-center"
      data-testid="modal-backdrop"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={`bg-bg-primary border border-border-default rounded-[var(--radius-card)] p-[var(--spacing-section)] max-h-[85vh] overflow-y-auto ${WIDTH_CLASSES[width]}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-bold text-text-primary">{title}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-secondary bg-transparent border-none cursor-pointer text-[16px] p-1" aria-label="Close">
            X
          </button>
        </div>
        <div>{children}</div>
        {actions && (
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border-default">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
