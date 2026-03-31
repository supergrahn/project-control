import { PHASE_INITIALS, PHASE_TO_STATUS } from '../sessionPhaseConfig'

describe('PHASE_INITIALS', () => {
  it('maps all known session phases to 2-letter initials', () => {
    expect(PHASE_INITIALS['ideate']).toBe('ID')
    expect(PHASE_INITIALS['brainstorm']).toBe('BR')
    expect(PHASE_INITIALS['spec']).toBe('SP')
    expect(PHASE_INITIALS['plan']).toBe('PL')
    expect(PHASE_INITIALS['develop']).toBe('DV')
    expect(PHASE_INITIALS['orchestrator']).toBe('OR')
  })
})

describe('PHASE_TO_STATUS', () => {
  it('maps session phases to TaskStatus for color lookup', () => {
    expect(PHASE_TO_STATUS['ideate']).toBe('idea')
    expect(PHASE_TO_STATUS['brainstorm']).toBe('idea')
    expect(PHASE_TO_STATUS['spec']).toBe('speccing')
    expect(PHASE_TO_STATUS['plan']).toBe('planning')
    expect(PHASE_TO_STATUS['develop']).toBe('developing')
    expect(PHASE_TO_STATUS['orchestrator']).toBe('developing')
  })
})
