import { describe, expect, it } from 'vitest'
import type { Signal } from '../types/signal'
import type { LifeGlobeSnapshot } from './lifeGlobe'
import { earthLifeCollection, earthPixelRatio, earthRenderPolicy, earthSignalCollection, prioritizeSignals, semanticZoomBand } from './earthRenderer'
import { buildTemporal } from './temporal'

function signal(id: string, severity: number, freshness: Signal['source']['freshness'] = 'live', provider = 'test'): Signal {
  return {
    id,
    source: { provider, retrievedAt: 100, freshness },
    type: provider === 'firms' ? 'fire' : provider === 'nhc' ? 'weather' : 'earthquake',
    title: id,
    timestamp: 100,
    location: { latitude: 10, longitude: 20 },
    severity,
    attributes: {},
    provenance: [],
  }
}

describe('Earth renderer policy', () => {
  it('uses deterministic four-band zoom boundaries', () => {
    expect([semanticZoomBand(0), semanticZoomBand(1.999), semanticZoomBand(2), semanticZoomBand(3.999), semanticZoomBand(4), semanticZoomBand(6.999), semanticZoomBand(7)])
      .toEqual(['orbit', 'orbit', 'continent', 'continent', 'region', 'region', 'local'])
  })

  it('caps detail by both zoom band and explicit performance mode', () => {
    const orbit = earthRenderPolicy('automatic', 'orbit')
    const local = earthRenderPolicy('automatic', 'local')
    expect(orbit.minimumIndividualSeverity).toBe(75)
    expect(local.minimumIndividualSeverity).toBe(0)
    expect(orbit.signals).toBeLessThan(local.signals)
    expect(earthRenderPolicy('battery', 'local').signals).toBeLessThan(local.signals)
    expect(earthRenderPolicy('quality', 'local').signals).toBe(5_000)
  })

  it('bounds device pixel ratio without requiring a renderer rebuild', () => {
    expect(earthPixelRatio('quality', 3)).toBe(2)
    expect(earthPixelRatio('automatic', 3)).toBe(1.5)
    expect(earthPixelRatio('battery', 3)).toBe(1)
    expect(earthPixelRatio('quality', Number.NaN)).toBe(1)
  })
})

describe('Earth renderer collections', () => {
  it('ranks before capping and always preserves the selected signal', () => {
    const input = [signal('routine', 10), signal('critical', 95, 'cached'), signal('selected', 1, 'demo')]
    expect(prioritizeSignals(input, 2, 'selected').map((item) => item.id)).toEqual(['selected', 'critical'])
    expect(prioritizeSignals([...input].reverse(), 2, 'selected').map((item) => item.id)).toEqual(['selected', 'critical'])
  })

  it('emits bounded thermal and storm properties for meaningful clustering', () => {
    const policy = { ...earthRenderPolicy('battery', 'orbit'), signals: 2 }
    const collection = earthSignalCollection([signal('routine', 1), signal('storm', 80, 'live', 'nhc'), signal('thermal', 90, 'delayed', 'firms')], policy)
    expect(collection.features.map((feature) => feature.properties.id)).toEqual(['thermal', 'storm'])
    expect(collection.features[0]?.properties.thermal).toBe(1)
    expect(collection.features[1]?.properties.storm).toBe(1)
  })

  it('preserves geographic and domain coverage before filling a global cap', () => {
    const crowded = Array.from({ length: 20 }, (_, index) => ({ ...signal(`fire-${index}`, 99 - index, 'live', 'firms'), location: { latitude: 10, longitude: 20 } }))
    const distant = { ...signal('distant-quake', 40), location: { latitude: -40, longitude: 140 } }
    expect(prioritizeSignals([...crowded, distant], 2, undefined, true).map((item) => item.id)).toContain('distant-quake')
  })

  it('ranks with canonical temporal effective time instead of the legacy timestamp', () => {
    const now = 2_000
    const newerConfirmation = { ...signal('confirmed-newer', 50), timestamp: 1, temporal: buildTemporal({ issuedAt: 1, confirmedAt: now, basis: 'current-state-confirmation' }) }
    const olderObservation = { ...signal('observed-older', 50), timestamp: 1_500, temporal: buildTemporal({ observedAt: 1_500, confirmedAt: 1_600, basis: 'event-occurrence' }) }
    expect(prioritizeSignals([olderObservation, newerConfirmation], 1)[0]?.id).toBe('confirmed-newer')
  })

  it('uses coarse LIFE cells from orbit and adds only bounded taxa regionally', () => {
    const life: LifeGlobeSnapshot = {
      queryKey: 'fixture',
      cells: Array.from({ length: 60 }, (_, index) => ({ id: `cell-${index}`, latitude: 0, longitude: index, observations: 60 - index })),
      taxa: Array.from({ length: 40 }, (_, index) => ({ id: `taxon-${index}`, taxonKey: index, scientificName: `Species ${index}`, observations: 40 - index, latitude: 0, longitude: index, sourceUrl: 'https://www.gbif.org' })),
      recordCount: 100,
      retrievedAt: 100,
      freshness: 'live',
      methodology: 'fixture',
    }
    const orbit = earthLifeCollection(life, earthRenderPolicy('battery', 'orbit'))
    const region = earthLifeCollection(life, earthRenderPolicy('battery', 'region'))
    expect(orbit.features).toHaveLength(28)
    expect(orbit.features.every((feature) => feature.properties.itemKind === 'cell')).toBe(true)
    expect(region.features.filter((feature) => feature.properties.itemKind === 'taxon')).toHaveLength(12)
  })
})
