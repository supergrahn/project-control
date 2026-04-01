'use client'
import { createContext, useContext, useState, useCallback } from 'react'

type ToastVariant = 'success' | 'error' | 'info'

type ToastItem = {
  id: number
  message: string
  variant: ToastVariant
}

type ToastFn = (opts: { message: string; variant: ToastVariant; duration?: number }) => void

const ToastContext = createContext<ToastFn>(() => {})

export function useToast(): ToastFn {
  return useContext(ToastContext)
}

const VARIANT_BORDER_COLORS: Record<ToastVariant, string> = {
  success: 'border-l-status-success',
  error:   'border-l-status-error',
  info:    'border-l-status-info',
}

let nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const toast: ToastFn = useCallback(({ message, variant, duration = 4000 }) => {
    const id = ++nextId
    setToasts(prev => [...prev, { id, message, variant }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`bg-bg-secondary border border-border-default ${VARIANT_BORDER_COLORS[t.variant]} border-l-2 rounded-[var(--radius-control)] px-4 py-3 shadow-lg text-[13px] text-text-primary pointer-events-auto`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
