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
  it('does not promote an ordinary singleton feed item into a discovery', () => {
    const now = 1_800_000_000_000
    const [ordinary] = createDemoSignals(now).filter((signal) => signal.severity === 64)
    expect(buildDiscoveries(ordinary ? [ordinary] : [], now)).toEqual([])
  })
  it('keeps the discovery feed intentionally bounded', () => {
    const now = 1_800_000_000_000
    const signals = Array.from({ length: 30 }, (_, index) => ({
      ...createDemoSignals(now - index * 1000)[2]!,
      id: `major-${index}`,
      location: { latitude: -70 + index * 4.5, longitude: -170 + index * 11 },
    }))
    expect(buildDiscoveries(signals, now).length).toBeLessThanOrEqual(12)
  })
})
