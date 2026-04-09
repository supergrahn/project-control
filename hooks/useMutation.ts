'use client'
import { useToast } from '@/components/ui/feedback/Toast'

export function useMutation() {
  const toast = useToast()

  return async function mutate<T>(
    fn: () => Promise<T>,
    errorMessage?: string,
  ): Promise<T | undefined> {
    try {
      return await fn()
    } catch {
      toast({ message: errorMessage ?? 'Something went wrong', variant: 'error' })
      return undefined
    }
  }
}
