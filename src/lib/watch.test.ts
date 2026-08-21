import { describe, expect, it } from 'vitest'
import { createPlaceWatch, evaluateWatch, placeWatchId } from './watch'
import type { Signal } from '../types/signal'

const signal = (id: string, latitude: number, longitude: number, severity: number): Signal => ({
  id, type: 'earthquake', title: id, timestamp: Date.now(), severity,
  location: { latitude, longitude }, attributes: {}, entities: [], provenance: [],
  source: { provider: 'test', retrievedAt: Date.now(), freshness: 'live' },
})

describe('local watch engine', () => {
  it('uses stable place IDs and transparent default conditions', () => {
    const watch = createPlaceWatch({ id: 1, name: 'Caguas', subtitle: 'Puerto Rico', latitude: 18.2388, longitude: -66.0352 }, 100)
    expect(watch.id).toBe(placeWatchId(18.2388, -66.0352))
    expect(watch.conditions).toEqual({ radiusKm: 250, minimumSeverity: 55 })
    expect(watch.delivery).toBe('in-app')
  })

  it('matches only sufficiently elevated signals inside the rule radius', () => {
    const watch = createPlaceWatch({ id: 1, name: 'Caguas', subtitle: 'Puerto Rico', latitude: 18.2388, longitude: -66.0352 })
    const match = evaluateWatch(watch, [signal('near', 18.5, -66.2, 70), signal('low', 18.4, -66.1, 20), signal('far', 30, -66, 90)], 200)
    expect(match.signalIds).toEqual(['near'])
    expect(match.evaluatedAt).toBe(200)
  })
})
