'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { ProjectProvider } from '@/hooks/useProjects'
import './globals.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
  }))
  return (
    <html lang="en">
      <body>
        <QueryClientProvider client={queryClient}>
          <ProjectProvider>
            {children}
          </ProjectProvider>
        </QueryClientProvider>
      </body>
    </html>
  )
}
