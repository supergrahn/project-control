'use client'
import { createContext, useContext, useState, useCallback, useRef } from 'react'
import type { Session } from './useSessions'
import type { WindowState } from '@/components/FloatingSessionWindow'

type SessionWindowsCtx = {
  windows: WindowState[]
  openWindow: (session: Session) => void
  closeWindow: (sessionId: string) => void
  minimizeWindow: (sessionId: string) => void
  restoreWindow: (sessionId: string) => void
  bringToFront: (sessionId: string) => void
  updatePosition: (sessionId: string, x: number, y: number) => void
  toggleAll: () => void
}

const Ctx = createContext<SessionWindowsCtx | null>(null)

const DEFAULT_W = 640
const DEFAULT_H = 400

export function SessionWindowProvider({ children }: { children: React.ReactNode }) {
  const [windows, setWindows] = useState<WindowState[]>([])
  const zCounter = useRef(1000)

  const openWindow = useCallback((session: Session) => {
    setWindows((prev) => {
      if (prev.find((w) => w.session.id === session.id)) {
        return prev.map((w) =>
          w.session.id === session.id
            ? { ...w, minimized: false, zIndex: ++zCounter.current }
            : w
        )
      }
      const offset = prev.length * 28
      return [
        ...prev,
        {
          session,
          x: 80 + offset,
          y: 80 + offset,
          width: DEFAULT_W,
          height: DEFAULT_H,
          minimized: false,
          zIndex: ++zCounter.current,
        },
      ]
    })
  }, [])

  const closeWindow = useCallback((sessionId: string) => {
    setWindows((prev) => prev.filter((w) => w.session.id !== sessionId))
  }, [])

  const minimizeWindow = useCallback((sessionId: string) => {
    setWindows((prev) => prev.map((w) => w.session.id === sessionId ? { ...w, minimized: true } : w))
  }, [])

  const restoreWindow = useCallback((sessionId: string) => {
    setWindows((prev) => prev.map((w) =>
      w.session.id === sessionId ? { ...w, minimized: false, zIndex: ++zCounter.current } : w
    ))
  }, [])

  const bringToFront = useCallback((sessionId: string) => {
    setWindows((prev) => prev.map((w) =>
      w.session.id === sessionId ? { ...w, zIndex: ++zCounter.current } : w
    ))
  }, [])

  const updatePosition = useCallback((sessionId: string, x: number, y: number) => {
    setWindows((prev) => prev.map((w) => w.session.id === sessionId ? { ...w, x, y } : w))
  }, [])

  const toggleAll = useCallback(() => {
    setWindows((prev) => {
      const anyVisible = prev.some((w) => !w.minimized)
      return prev.map((w) => ({ ...w, minimized: anyVisible }))
    })
  }, [])

  return (
    <Ctx.Provider value={{ windows, openWindow, closeWindow, minimizeWindow, restoreWindow, bringToFront, updatePosition, toggleAll }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSessionWindows() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSessionWindows must be inside SessionWindowProvider')
  return ctx
}
