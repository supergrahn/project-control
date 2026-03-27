import { getDb, listDecisions } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId') ?? undefined

  const enc = new TextEncoder()
  const seenIds = new Set<string>()

  const stream = new ReadableStream({
    start(controller) {
      const initial = listDecisions(getDb(), { projectId, limit: 15 })
      initial.forEach(d => seenIds.add(d.id))
      controller.enqueue(enc.encode(`data: ${JSON.stringify({ decisions: initial })}\n\n`))

      const interval = setInterval(() => {
        try {
          const latest = listDecisions(getDb(), { projectId, limit: 20 })
          const newOnes = latest.filter(d => !seenIds.has(d.id))
          if (newOnes.length > 0) {
            newOnes.forEach(d => seenIds.add(d.id))
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ decisions: newOnes })}\n\n`))
          }
        } catch {
          clearInterval(interval)
          try { controller.close() } catch {}
        }
      }, 500)

      req.signal.addEventListener('abort', () => {
        clearInterval(interval)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
