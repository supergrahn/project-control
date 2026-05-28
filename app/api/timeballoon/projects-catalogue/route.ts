// GET /api/timeballoon/projects-catalogue
// Spec O: the authoritative project + Marathon-code catalogue. TimeBalloon
// pulls this on boot / WS reconnect and caches it, then uses the codes as
// ground truth when grouping the day into buckets and exporting to Marathon.
//
// Response shape:
//   {
//     projects: [
//       { id, name, path, marathon_code, marathon_account, marathon_default_wt,
//         sources: [ { adapter_key, resource_ids } ] }
//     ],
//     work_type_codes: [ { code, name, marathon_legacy_code } ],
//     served_at: "2026-05-28T..."
//   }

import { NextRequest, NextResponse } from 'next/server'
import { getDb, listProjects, listWorkTypeCodes } from '@/lib/db'
import { requireToken } from '@/lib/timeballoon-auth'
import { listTaskSourceConfigs } from '@/lib/db/taskSourceConfig'

export async function GET(req: NextRequest) {
  const authError = requireToken(req)
  if (authError) return authError

  const db = getDb()
  const projects = listProjects(db).map((p) => {
    const sources = listTaskSourceConfigs(db, p.id)
      .filter((c) => c.is_active)
      .map((c) => ({ adapter_key: c.adapter_key, resource_ids: c.resource_ids }))
    return {
      id: p.id,
      name: p.name,
      path: p.path,
      marathon_code: p.marathon_code,
      marathon_account: p.marathon_account,
      marathon_default_wt: p.marathon_default_wt,
      sources,
    }
  })

  const work_type_codes = listWorkTypeCodes(db).map((w) => ({
    code: w.code,
    name: w.name,
    marathon_legacy_code: w.marathon_legacy_code,
  }))

  return NextResponse.json({
    projects,
    work_type_codes,
    served_at: new Date().toISOString(),
  })
}
