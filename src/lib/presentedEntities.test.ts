import { describe, expect, it } from 'vitest'
import { buildPresentedEntities } from './presentedEntities'
import type { Signal } from '../types/signal'

const signal = (id: string, provider: string, family: string, upstreamKey: string, refs: Signal['source']['upstreamRefs'] = []): Signal => ({
  id, type: 'weather', title: id, timestamp: 1, severity: 70,
  source: { provider, sourceFamily: family, sourceRole: provider === 'nhc' ? 'official-product' : 'aggregator', upstreamKey, upstreamRefs: refs, retrievedAt: 1, freshness: 'live' },
  attributes: {}, provenance: provider === 'nhc' ? [{ label: 'OFFICIAL_SOURCE', description: provider }] : [{ label: 'OPEN_DATA', description: provider }],
})

describe('presented entities', () => {
  it('merges exact shared upstream identity and keeps the official representative', () => {
    const nhc = signal('nhc', 'nhc', 'noaa-nhc', 'atcf:AL052026')
    const eonet = signal('eonet', 'eonet', 'nasa-eonet', 'eonet:E1', [{ sourceFamily: 'noaa-nhc', upstreamKey: 'atcf:AL052026' }])
    const entities = buildPresentedEntities([eonet, nhc])
    expect(entities).toHaveLength(1)
    expect(entities[0]?.representative.id).toBe('nhc')
    expect(entities[0]?.independentProviders).toEqual(['noaa-nhc'])
    expect(entities[0]?.evidence).toBe('official')
  })

  it('never fuzzy-merges matching names without a shared exact identifier', () => {
    const left = { ...signal('a', 'gdacs', 'gdacs', 'tc:1'), title: 'Hurricane Ada' }
    const right = { ...signal('b', 'eonet', 'nasa-eonet', 'event:2'), title: 'Hurricane Ada' }
    expect(buildPresentedEntities([left, right])).toHaveLength(2)
  })

  it('does not count two aggregators of the same terminal family as corroboration', () => {
    const upstream = [{ sourceFamily: 'agency-x', upstreamKey: 'event:9' }]
    const entities = buildPresentedEntities([signal('a', 'gdacs', 'gdacs', 'a', upstream), signal('b', 'eonet', 'eonet', 'b', upstream)])
    expect(entities[0]?.independentProviders).toEqual(['agency-x'])
    expect(entities[0]?.evidence).toBe('reported')
  })
})
