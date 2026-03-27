'use client'
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

type FocusContextType = {
  focusIds: string[]
  isFocused: boolean
  toggleFocus: (projectId: string) => void
  clearFocus: () => void
  isProjectFocused: (projectId: string) => boolean
}

const FocusContext = createContext<FocusContextType>({
  focusIds: [], isFocused: false, toggleFocus: () => {}, clearFocus: () => {}, isProjectFocused: () => true,
})

export function FocusProvider({ children }: { children: ReactNode }) {
  const [focusIds, setFocusIds] = useState<string[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('focus-projects')
      if (saved) setFocusIds(JSON.parse(saved))
    } catch {}
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem('focus-projects', JSON.stringify(focusIds))
  }, [focusIds, hydrated])

  const toggleFocus = useCallback((id: string) => {
    setFocusIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev.slice(0, 2), id]) // max 3
  }, [])

  const clearFocus = useCallback(() => setFocusIds([]), [])
  const isProjectFocused = useCallback((id: string) => focusIds.length === 0 || focusIds.includes(id), [focusIds])

  return (
    <FocusContext.Provider value={{ focusIds, isFocused: focusIds.length > 0, toggleFocus, clearFocus, isProjectFocused }}>
      {children}
    </FocusContext.Provider>
  )
}

export function useFocus() { return useContext(FocusContext) }
