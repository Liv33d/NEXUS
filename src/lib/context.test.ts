import { describe, expect, it } from 'vitest'
import type { Signal } from '../types/signal'
import { buildSignalContext } from './context'

const base = (overrides: Partial<Signal>): Signal => ({
  id: 'test', source: { provider: 'test', retrievedAt: 1, freshness: 'live' }, type: 'environment', title: 'Test signal', timestamp: 1, attributes: {}, provenance: [], ...overrides,
})

describe('deterministic context engine', () => {
  it('puts earthquake meaning before measurements', () => {
    const context = buildSignalContext(base({ type: 'earthquake', title: 'M 5.8 — Offshore test', magnitude: 5.8, attributes: { depthKm: 10, tsunami: false, feltReports: 42 } }))
    expect(context.headline).toContain('Moderate earthquake')
    expect(context.plainLanguageSummary).toContain('magnitude 5.8')
    expect(context.technicalFacts).toContainEqual({ label: 'Depth', value: '10 km' })
  })

  it('does not convert a thermal anomaly into a confirmed wildfire', () => {
    const context = buildSignalContext(base({ type: 'fire', source: { provider: 'firms', retrievedAt: 1, freshness: 'live' } }))
    expect(context.headline).toBe('Unclassified thermal anomaly')
    expect(context.plainLanguageSummary).toContain('does not have enough corroborating evidence')
    expect(context.methodology).toContain('keeps the source classification unknown')
  })

  it('distinguishes a reported fire event from a stand-alone heat detection', () => {
    const context = buildSignalContext(base({ type: 'fire', title: 'Wildfire — Example', source: { provider: 'eonet', retrievedAt: 1, freshness: 'delayed' } }))
    expect(context.headline).toBe('Reported wildfire activity')
    expect(context.confidence).toBe('reported')
  })

  it('explains FEMA declarations as reported government actions', () => {
    const context = buildSignalContext(base({ source: { provider: 'openfema', retrievedAt: 1, freshness: 'delayed' }, attributes: { incidentType: 'Flood', disasterNumber: 1234, declarationType: 'DR', designatedAreas: ['Example County'], assistancePrograms: ['Public assistance'] } }))
    expect(context.headline).toBe('Federal flood declaration')
    expect(context.confidence).toBe('reported')
    expect(context.whyItMatters).toContain('public assistance')
  })
})
