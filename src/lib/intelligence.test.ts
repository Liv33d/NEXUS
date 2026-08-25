import { describe, expect, it } from 'vitest'
import { classifyThermalSignal, discoveryToIntelligence, ecologicalClusterToIntelligence, lifeTaxonToIntelligence, migrationToIntelligence, observerTaxonToIntelligence, orbitalPassToIntelligence, signalToIntelligence } from './intelligence'
import type { Signal } from '../types/signal'
import { createDemoSignals } from '../data/demo'

describe('universal intelligence objects', () => {
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

  it('leads with a common bird name and labels movement as derived', () => {
    const object = migrationToIntelligence({
      id: 'migration-1', taxonKey: 1, species: 'Catharus minimus', commonName: 'Gray-cheeked Thrush',
      startLatitude: 18.2, startLongitude: -66.4, endLatitude: 35.8, endLongitude: -79.1,
      recentObservations: 47, priorObservations: 31, distanceKm: 2_471, direction: 'northeast', confidence: .76,
    }, 1_800_000_000_000, 'https://www.gbif.org/', 'Two-window comparison.')
    expect(object.title).toBe('Gray-cheeked Thrush')
    expect(object.scientificName).toBe('Catharus minimus')
    expect(object.status).toBe('derived')
    expect(object.evidence).toBe('derived')
    expect(object.confidence).toBeUndefined()
    expect(object.movement?.interpretation).toContain('observation centers')
    expect(object.whyItMatters).toContain('not a track')
  })

  it('creates selectable species and coarse ecological cluster objects', () => {
    const species = lifeTaxonToIntelligence({ id: 'taxon-1', taxonKey: 1, scientificName: 'Setophaga ruticilla', commonName: 'American Redstart', observations: 14, latitude: 18, longitude: -66, sourceUrl: 'https://www.gbif.org/species/1' }, 1_800_000_000_000, 'Bounded sample.')
    const cluster = ecologicalClusterToIntelligence({ id: 'h3', latitude: 18, longitude: -66, observations: 142 }, 'life', 1_800_000_000_000, 'Coarse aggregation.')
    expect(species.title).toBe('American Redstart')
    expect(species.scientificName).toBe('Setophaga ruticilla')
    expect(cluster.title).toBe('142 life observations')
    expect(cluster.methodology).toContain('Coarse aggregation')
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

  it('refuses generic or unlicensed hero media for selected hazards', () => {
    const base: Signal = { id: 'storm', source: { provider: 'nhc', retrievedAt: 10, freshness: 'live', url: 'https://www.nhc.noaa.gov' }, type: 'weather', title: 'Hurricane Example', timestamp: 10, location: { latitude: 22, longitude: -70 }, attributes: {}, provenance: [] }
    const volcano: Signal = { ...base, id: 'volcano', source: { ...base.source, provider: 'usgs-volcano' }, type: 'environment', attributes: { volcanoImage: 'https://example.com/unlicensed.jpg' } }
    expect(signalToIntelligence(base).media).toEqual([])
    expect(signalToIntelligence(volcano).media).toEqual([])
  })
})
