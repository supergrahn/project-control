export type RiskFlag = 'database-migration' | 'auth' | 'breaking-change' | 'test-failure'

const RISK_PATTERNS: [RiskFlag, RegExp][] = [
  ['database-migration', /database migration|db migration|ALTER TABLE|schema change/i],
  ['auth', /\bauth\b|token|credential|session storage|api key/i],
  ['breaking-change', /breaking\b.*\bchange|api contract|incompatible change/i],
  ['test-failure', /\d+ tests? failed|test suite fail/i],
]

export function evaluateRisk(content: string): RiskFlag[] {
  return RISK_PATTERNS
    .filter(([, pattern]) => pattern.test(content))
    .map(([flag]) => flag)
}
