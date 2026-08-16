import { describe, expect, it } from 'vitest'
import { createDemoSignals } from '../data/demo'
import { buildDiscoveries, buildRelationships } from './discovery'

describe('discovery engine', () => {
  it('creates conservative cross-source relationships', () => {
    const signals = createDemoSignals(1_800_000_000_000)
    const relationships = buildRelationships(signals)
    expect(relationships.some((item) => item.reason.includes('occurred within'))).toBe(true)
  })
  it('generates deterministic discoveries', () => {
    const now = 1_800_000_000_000
    expect(buildDiscoveries(createDemoSignals(now), now)).toEqual(buildDiscoveries(createDemoSignals(now), now))
  })
})
