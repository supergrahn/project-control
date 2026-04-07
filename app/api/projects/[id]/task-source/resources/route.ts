import { NextResponse } from 'next/server'
import { getTaskSourceAdapter } from '@/lib/taskSources/adapters'

export async function POST(req: Request) {
  const { adapterKey, config } = await req.json()

  if (!adapterKey || !config) {
    return NextResponse.json({ error: 'adapterKey and config required' }, { status: 400 })
  }

  try {
    const adapter = getTaskSourceAdapter(adapterKey)
    const resources = await adapter.fetchAvailableResources(config)
    return NextResponse.json({ resources })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? 'Failed to fetch resources' },
      { status: 502 }
    )
  }
}
