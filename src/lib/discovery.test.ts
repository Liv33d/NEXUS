import { describe, expect, it } from 'vitest'
import { createDemoSignals } from '../data/demo'
import { validateSignal } from './signal'
import { buildDiscoveries, buildRelationships } from './discovery'
import { buildTemporal } from './temporal'

const weather = (id: string, longitude: number, severity: number, now: number) => validateSignal({
  id, source: { provider: `provider-${id}`, retrievedAt: now, freshness: 'live' }, type: 'weather', title: id,
  timestamp: now, location: { latitude: 0, longitude }, severity, attributes: {}, provenance: [],
})

describe('discovery engine', () => {
  it('creates conservative cross-source relationships', () => {
    const signals = createDemoSignals(1_800_000_000_000)
    const relationships = buildRelationships(signals)
    expect(relationships.some((item) => item.reason.includes('occurred within'))).toBe(true)
  })
  it('uses current-state confirmation when relating a multi-day open fire to a current pixel', () => {
    const now = 1_800_000_000_000
    const current = validateSignal({ id: 'firms-current', source: { provider: 'firms', retrievedAt: now, freshness: 'delayed' }, type: 'fire', title: 'Thermal detection', timestamp: now, temporal: buildTemporal({ observedAt: now, confirmedAt: now, basis: 'sensor-observation' }), location: { latitude: 34, longitude: -118 }, severity: 60, attributes: {}, provenance: [] })
    const open = validateSignal({ id: 'eonet-open', source: { provider: 'eonet', retrievedAt: now, freshness: 'delayed' }, type: 'fire', title: 'Open wildfire', timestamp: now - 5 * 86400000, temporal: buildTemporal({ observedAt: now - 5 * 86400000, confirmedAt: now - 60_000, basis: 'current-state-confirmation' }), location: { latitude: 34.01, longitude: -118 }, severity: 70, attributes: {}, provenance: [] })
    expect(buildRelationships([open, current])).toHaveLength(1)
    expect(buildDiscoveries([open, current], now)[0]?.signalIds.sort()).toEqual(['eonet-open', 'firms-current'])
  })
  it('uses product validity overlap for a multi-day open GDACS fire', () => {
    const now = 1_800_000_000_000
    const current = validateSignal({ id: 'firms-pixel', source: { provider: 'firms', retrievedAt: now, freshness: 'delayed' }, type: 'fire', title: 'Thermal detection', timestamp: now, temporal: buildTemporal({ observedAt: now, confirmedAt: now, basis: 'sensor-observation' }), location: { latitude: 34, longitude: -118 }, severity: 60, attributes: {}, provenance: [] })
    const open = validateSignal({ id: 'gdacs-open', source: { provider: 'gdacs', retrievedAt: now, freshness: 'delayed' }, type: 'fire', title: 'Open wildfire', timestamp: now - 5 * 86400000, temporal: buildTemporal({ validFrom: now - 5 * 86400000, confirmedAt: now, basis: 'product-validity' }), expiresAt: now + 86400000, location: { latitude: 34.01, longitude: -118 }, severity: 70, attributes: {}, provenance: [] })
    expect(buildRelationships([open, current])).toHaveLength(1)
  })
  it('does not lose an older observation inside a long-running product interval during candidate indexing', () => {
    const now = 1_800_000_000_000
    const observationAt = now - 5 * 86400000
    const observation = validateSignal({ id: 'firms-older-pixel', source: { provider: 'firms', retrievedAt: observationAt + 60_000, freshness: 'delayed' }, type: 'fire', title: 'Earlier thermal detection', timestamp: observationAt, temporal: buildTemporal({ observedAt: observationAt, confirmedAt: observationAt + 60_000, basis: 'sensor-observation' }), location: { latitude: 34, longitude: -118 }, severity: 60, attributes: {}, provenance: [] })
    const product = validateSignal({ id: 'gdacs-seven-day-fire', source: { provider: 'gdacs', retrievedAt: now, freshness: 'delayed' }, type: 'fire', title: 'Seven-day active wildfire', timestamp: now - 7 * 86400000, temporal: buildTemporal({ validFrom: now - 7 * 86400000, confirmedAt: now, basis: 'product-validity' }), expiresAt: now + 86400000, location: { latitude: 34.01, longitude: -118 }, severity: 70, attributes: {}, provenance: [] })
    expect(buildRelationships([observation, product])).toHaveLength(1)
  })
  it('keeps geodesically nearby high-latitude signals in the candidate index', () => {
    const now = 1_800_000_000_000
    const arctic = (id: string, longitude: number) => validateSignal({ id, source: { provider: id, retrievedAt: now, freshness: 'live', upstreamKey: 'same-arctic-event' }, type: 'weather', title: id, timestamp: now, temporal: buildTemporal({ observedAt: now, confirmedAt: now, basis: 'event-occurrence' }), location: { latitude: 80, longitude }, severity: 70, attributes: {}, provenance: [] })
    const relationships = buildRelationships([arctic('west', -10), arctic('east', 10)])
    expect(relationships).toHaveLength(1)
    expect(relationships[0]?.distanceKm).toBeLessThan(500)
  })
  it('scans all longitudes when a candidate latitude band reaches a pole', () => {
    const now = 1_800_000_000_000
    const polar = (id: string, latitude: number, longitude: number) => validateSignal({ id, source: { provider: id, retrievedAt: now, freshness: 'live', upstreamKey: 'same-polar-event' }, type: 'weather', title: id, timestamp: now, temporal: buildTemporal({ observedAt: now, confirmedAt: now, basis: 'event-occurrence' }), location: { latitude, longitude }, severity: 70, attributes: {}, provenance: [] })
    const relationships = buildRelationships([polar('a-pole', 89, -90), polar('z-lower', 87, 90)])
    expect(relationships).toHaveLength(1)
    expect(relationships[0]?.distanceKm).toBeLessThan(500)
  })
  it('normalizes insertion and lookup consistently across the antimeridian', () => {
    const now = 1_800_000_000_000
    const edge = (id: string, longitude: number) => validateSignal({ id, source: { provider: id, retrievedAt: now, freshness: 'live', upstreamKey: 'same-dateline-event' }, type: 'weather', title: id, timestamp: now, temporal: buildTemporal({ observedAt: now, confirmedAt: now, basis: 'event-occurrence' }), location: { latitude: 10, longitude }, severity: 70, attributes: {}, provenance: [] })
    const relationships = buildRelationships([edge('a-east', 180), edge('z-west', -179)])
    expect(relationships).toHaveLength(1)
    expect(relationships[0]?.distanceKm).toBeLessThan(150)
  })
  it('generates deterministic discoveries', () => {
    const now = 1_800_000_000_000
    expect(buildDiscoveries(createDemoSignals(now), now)).toEqual(buildDiscoveries(createDemoSignals(now), now))
  })
  it('is input-order invariant', () => {
    const now = 1_800_000_000_000
    const signals = createDemoSignals(now)
    expect(buildDiscoveries(signals, now)).toEqual(buildDiscoveries([...signals].reverse(), now))
  })
  it('does not bridge a transitive proximity chain into one phenomenon', () => {
    const now = 1_800_000_000_000
    const chain = [weather('a', 0, 85, now), weather('b', 2, 90, now), weather('c', 4, 80, now), weather('d', 6, 84, now)]
    const discoveries = buildDiscoveries(chain, now)
    expect(discoveries.every((discovery) => discovery.signalIds.length < chain.length)).toBe(true)
    expect(discoveries.flatMap((discovery) => discovery.signalIds).sort()).toEqual(['a', 'b', 'c', 'd'])
  })
  it('does not count two provider labels from one source family as corroboration', () => {
    const now = 1_800_000_000_000
    const first = weather('family-a', 0, 90, now)
    const second = weather('family-b', .2, 80, now)
    first.source = { ...first.source, sourceFamily: 'shared-upstream', upstreamKey: 'shared:a' }
    second.source = { ...second.source, sourceFamily: 'shared-upstream', upstreamKey: 'shared:b' }
    const [discovery] = buildDiscoveries([first, second], now)
    expect(discovery?.scoreComponents?.diversity).toBe(0)
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
  it('exposes an explainable score composition', () => {
    const now = 1_800_000_000_000
    const discovery = buildDiscoveries(createDemoSignals(now), now)[0]
    expect(discovery?.scoreComponents).toBeDefined()
    expect(Object.values(discovery?.scoreComponents ?? {}).every((value) => value >= 0)).toBe(true)
  })
})
