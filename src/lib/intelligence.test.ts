import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyThermalSignal, discoveryToIntelligence, ecologicalClusterToIntelligence, lifeTaxonToIntelligence, observerTaxonToIntelligence, orbitalPassToIntelligence, signalToIntelligence } from './intelligence'
import type { Signal } from '../types/signal'
import { createDemoSignals } from '../data/demo'
import { buildTemporal } from './temporal'

describe('universal intelligence objects', () => {
  afterEach(() => vi.restoreAllMocks())

  it('turns every normalized Signal into one human-first selectable object', () => {
    for (const signal of createDemoSignals(1_800_000_000_000)) {
      const object = signalToIntelligence(signal)
      expect(object.id).toBe(signal.id)
      expect(object.title.length).toBeGreaterThan(2)
      expect(object.summary.length).toBeGreaterThan(8)
      expect(object.sourceSignal).toBe(signal)
      expect(object.methodology.length).toBeGreaterThan(10)
    }
  })

  it('creates selectable species and coarse ecological cluster objects', () => {
    const species = lifeTaxonToIntelligence({ id: 'taxon-1', taxonKey: 1, scientificName: 'Setophaga ruticilla', commonName: 'American Redstart', observations: 14, latitude: 18, longitude: -66, sourceUrl: 'https://www.gbif.org/species/1' }, 1_800_000_000_000, 'Bounded sample.')
    const cluster = ecologicalClusterToIntelligence({ id: 'h3', latitude: 18, longitude: -66, observations: 142 }, 1_800_000_000_000, 'Coarse aggregation.')
    const cachedCluster = ecologicalClusterToIntelligence({ id: 'stored-h3', latitude: 18, longitude: -66, observations: 142 }, 1_800_000_000_000, 'Stored coarse aggregation.', 'cached')
    expect(species.title).toBe('American Redstart')
    expect(species.scientificName).toBe('Setophaga ruticilla')
    expect(cluster.title).toBe('142 life observation records')
    expect(cluster.methodology).toContain('Coarse aggregation')
    expect(cachedCluster.status).toBe('cached')
  })

  it('turns a discovery into one phenomenon with selectable evidence', () => {
    const signals = createDemoSignals(1_800_000_000_000)
    const object = discoveryToIntelligence({ id: 'pulse-1', createdAt: 1_800_000_000_000, title: 'Elevated activity', description: 'Several recent signals occurred together.', score: 72, level: 'significant', center: { latitude: 18, longitude: -66 }, signalIds: signals.slice(0, 2).map((signal) => signal.id), entityIds: [], relationships: [], status: 'new', tags: [] }, signals)
    expect(object.kind).toBe('phenomenon')
    expect(object.relationships).toHaveLength(2)
    expect(object.relationships[0]?.object?.sourceSignal).toBeTruthy()
  })

  it('makes Observer LIFE and orbital rows real intelligence entrances', () => {
    const life = observerTaxonToIntelligence({ id: 'bird', scientificName: 'Setophaga ruticilla', commonName: 'American Redstart', count: 5, license: 'CC BY', occurrenceUrl: 'https://www.gbif.org/occurrence/1' }, { radiusKm: 75, sampledRecords: 5, totalMatchingRecords: 5, taxa: [], retrievedAt: 1_800_000_000_000, sourceUrl: 'https://www.gbif.org', methodology: 'Bounded local sample.' }, { latitude: 18, longitude: -66 })
    const pass = orbitalPassToIntelligence({ objectName: 'ISS', catalogId: 25544, start: 1_800_000_000_000, peak: 1_800_000_120_000, end: 1_800_000_300_000, maxElevation: 67, darkSky: true }, { latitude: 18, longitude: -66 })
    expect(life.title).toBe('American Redstart')
    expect(pass.kind).toBe('orbital-pass')
    expect(pass.summary).toContain('rise above 18°')
  })

  it('classifies thermal evidence conservatively and exposes corroboration', () => {
    const thermal: Signal = { id: 'firms-1', source: { provider: 'firms', retrievedAt: 10, freshness: 'delayed' }, type: 'fire', title: 'Thermal detection', timestamp: 10, location: { latitude: 34, longitude: -118 }, attributes: {}, provenance: [] }
    const reported: Signal = { ...thermal, id: 'eonet-1', source: { provider: 'eonet', retrievedAt: 10, freshness: 'delayed' }, title: 'Wildfire — Example' }
    expect(classifyThermalSignal(thermal, [thermal]).classification).toBe('unclassified')
    expect(classifyThermalSignal(thermal, [thermal, reported]).classification).toBe('possible-fire')
    const object = signalToIntelligence(thermal, [thermal, reported])
    expect(object.title).toBe('Possible fire activity')
    expect(object.relationships[0]?.title).toContain('Reported wildfire activity')
    expect(object.methodology).toContain('proximity does not prove causation')
  })

  it('does not classify thermal detections from distant, stale, or untrusted fire text', () => {
    const now = 1_800_000_000_000
    const thermal: Signal = { id: 'firms', source: { provider: 'firms', retrievedAt: now, freshness: 'live' }, type: 'fire', title: 'Thermal detection', timestamp: now, location: { latitude: 34, longitude: -118 }, attributes: {}, provenance: [] }
    const evidence = (provider: string, latitude: number, timestamp: number): Signal => ({ ...thermal, id: `${provider}-${latitude}-${timestamp}`, source: { provider, retrievedAt: now, freshness: 'live' }, title: 'Wildfire report', timestamp, location: { latitude, longitude: -118 } })
    expect(classifyThermalSignal(thermal, [evidence('eonet', 34.12, now)]).classification).toBe('unclassified')
    expect(classifyThermalSignal(thermal, [evidence('eonet', 34.01, now - 25 * 3_600_000)]).classification).toBe('unclassified')
    expect(classifyThermalSignal(thermal, [evidence('demo', 34.01, now)]).classification).toBe('unclassified')
    expect(classifyThermalSignal(thermal, [evidence('eonet', 34.01, now)]).classification).toBe('possible-fire')
  })

  it('never describes delayed or cached evidence as near-real-time', () => {
    const now = 1_800_000_000_000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const base: Signal = { id: 'signal', source: { provider: 'test', retrievedAt: now, freshness: 'live' }, type: 'weather', title: 'Signal', timestamp: now - 60_000, temporal: buildTemporal({ observedAt: now - 60_000, confirmedAt: now, basis: 'sensor-observation' }), attributes: {}, provenance: [] }
    expect(signalToIntelligence(base).status).toBe('near-real-time')
    expect(signalToIntelligence({ ...base, source: { ...base.source, freshness: 'delayed' } }).status).toBe('recent')
    expect(signalToIntelligence({ ...base, source: { ...base.source, freshness: 'cached' } }).status).toBe('cached')
    expect(signalToIntelligence({ ...base, source: { ...base.source, provider: 'nhc', freshness: 'delayed' } }).status).toBe('forecast')
  })

  it('keeps repeated FIRMS pixels unclassified without multi-day source evidence', () => {
    const now = 1_800_000_000_000
    const thermal: Signal = { id: 'firms-1', source: { provider: 'firms', retrievedAt: now, freshness: 'delayed' }, type: 'fire', title: 'Thermal detection', timestamp: now, location: { latitude: 34, longitude: -118 }, attributes: {}, provenance: [] }
    const repeats = [2, 3].map((index) => ({ ...thermal, id: `firms-${index}`, timestamp: now - index * 30 * 60_000 }))
    expect(classifyThermalSignal(thermal, [thermal, ...repeats]).classification).toBe('unclassified')
  })

  it('can contextualize a current thermal pixel with a still-open delayed event', () => {
    const now = 1_800_000_000_000
    const thermal: Signal = { id: 'firms-current', source: { provider: 'firms', retrievedAt: now, freshness: 'delayed' }, type: 'fire', title: 'Thermal detection', timestamp: now, temporal: buildTemporal({ observedAt: now, confirmedAt: now, basis: 'sensor-observation' }), location: { latitude: 34, longitude: -118 }, attributes: {}, provenance: [] }
    const openFire: Signal = { id: 'eonet-open', source: { provider: 'eonet', retrievedAt: now, freshness: 'delayed' }, type: 'fire', title: 'Wildfire report', timestamp: now - 5 * 86400000, temporal: buildTemporal({ observedAt: now - 5 * 86400000, confirmedAt: now - 60_000, basis: 'current-state-confirmation' }), location: { latitude: 34.01, longitude: -118 }, attributes: {}, provenance: [] }
    expect(classifyThermalSignal(thermal, [openFire]).classification).toBe('possible-fire')
  })

  it('uses an open GDACS validity interval rather than its old start date', () => {
    const now = 1_800_000_000_000
    const thermal: Signal = { id: 'firms-current', source: { provider: 'firms', retrievedAt: now, freshness: 'delayed' }, type: 'fire', title: 'Thermal detection', timestamp: now, temporal: buildTemporal({ observedAt: now, confirmedAt: now, basis: 'sensor-observation' }), location: { latitude: 34, longitude: -118 }, attributes: {}, provenance: [] }
    const openFire: Signal = { id: 'gdacs-open', source: { provider: 'gdacs', retrievedAt: now, freshness: 'delayed' }, type: 'fire', title: 'Wildfire report', timestamp: now - 5 * 86400000, temporal: buildTemporal({ validFrom: now - 5 * 86400000, confirmedAt: now, basis: 'product-validity' }), expiresAt: now + 86400000, location: { latitude: 34.01, longitude: -118 }, attributes: {}, provenance: [] }
    expect(classifyThermalSignal(thermal, [openFire]).classification).toBe('possible-fire')
  })

  it('refuses generic or unlicensed hero media for selected hazards', () => {
    const base: Signal = { id: 'storm', source: { provider: 'nhc', retrievedAt: 10, freshness: 'live', url: 'https://www.nhc.noaa.gov' }, type: 'weather', title: 'Hurricane Example', timestamp: 10, location: { latitude: 22, longitude: -70 }, attributes: {}, provenance: [] }
    const volcano: Signal = { ...base, id: 'volcano', source: { ...base.source, provider: 'usgs-volcano' }, type: 'environment', attributes: { volcanoImage: 'https://example.com/unlicensed.jpg' } }
    expect(signalToIntelligence(base).media).toEqual([])
    expect(signalToIntelligence(volcano).media).toEqual([])
  })
})
