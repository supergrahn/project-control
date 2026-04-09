export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const err = new Error(`API error ${res.status}: ${res.statusText}`) as Error & { status: number }
    err.status = res.status
    throw err
  }
  return res.json() as Promise<T>
}

export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  { retries = 3, timeoutMs = 10_000 }: { retries?: number; timeoutMs?: number } = {},
): Promise<Response> {
  let lastError: Error = new Error('Unknown error')

  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(url, { ...options, signal: controller.signal })
      // Return immediately for 2xx and 4xx — client errors won't self-heal
      if (res.ok || (res.status >= 400 && res.status < 500)) return res
      lastError = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastError = (err as Error).name === 'AbortError'
        ? new Error(`Request timed out after ${timeoutMs}ms`)
        : (err as Error)
    } finally {
      clearTimeout(timeoutId)
    }

    if (attempt < retries - 1) {
      await new Promise<void>(r => setTimeout(r, 1000 * 2 ** attempt))
    }
  }

  throw lastError
}
