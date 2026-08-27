import { describe, expect, it } from 'vitest'
import type { Signal } from '../types/signal'
import { buildTemporal, replayBounds } from '../lib/temporal'

const base = (id: string, timestamp: number): Signal => ({ id, type: 'weather', title: id, timestamp, source: { provider: 'test', retrievedAt: 1_000, freshness: 'live' }, attributes: {}, provenance: [] })

describe('Reality replay temporal bounds', () => {
  it('clamps a long-running valid product to the selected time window', () => {
    const product = { ...base('product', 10), temporal: buildTemporal({ validFrom: 10, validUntil: 2_000, confirmedAt: 900, basis: 'product-validity' }) }
    expect(replayBounds([product], 800, 1_000)).toEqual({ start: 800, end: 1_000 })
  })

  it('uses occurrence times for observations and excludes non-overlapping products', () => {
    const observation = { ...base('observation', 850), temporal: buildTemporal({ observedAt: 850, confirmedAt: 900, basis: 'sensor-observation' }) }
    const expired = { ...base('expired', 100), temporal: buildTemporal({ validFrom: 100, validUntil: 200, confirmedAt: 200, basis: 'product-validity' }) }
    expect(replayBounds([observation, expired], 800, 1_000)).toEqual({ start: 850, end: 850 })
  })
})
