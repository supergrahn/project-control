import { NextResponse } from 'next/server'
import { listTaskSourceAdapters } from '@/lib/taskSources/adapters'

export async function GET() {
  const adapters = listTaskSourceAdapters()
  return NextResponse.json(adapters.map(a => ({
    key: a.key,
    name: a.name,
    configFields: a.configFields,
    resourceSelectionLabel: a.resourceSelectionLabel,
  })))
}
