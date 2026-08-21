import { describe, expect, it } from 'vitest'
import { createPlaceWatch, evaluateWatch, evaluateWatchTriggers, evaluateWeatherWatch, placeWatchId } from './watch'
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
    expect(watch.conditions).toEqual({ radiusKm: 250, minimumSeverity: 55, cooldownMs: 900000, dedupeWindowMs: 86400000, weather: { severeAlerts: true, precipitationProbabilityAtLeast: 70, windSpeedAtLeastKmh: 60 } })
    expect(watch.delivery).toBe('in-app')
  })

  it('matches only sufficiently elevated signals inside the rule radius', () => {
    const watch = createPlaceWatch({ id: 1, name: 'Caguas', subtitle: 'Puerto Rico', latitude: 18.2388, longitude: -66.0352 })
    const match = evaluateWatch(watch, [signal('near', 18.5, -66.2, 70), signal('low', 18.4, -66.1, 20), signal('far', 30, -66, 90)], 200)
    expect(match.signalIds).toEqual(['near'])
    expect(match.evaluatedAt).toBe(200)
  })

  it('deduplicates triggers and applies a rule cooldown', () => {
    const watch = createPlaceWatch({ id: 1, name: 'Caguas', subtitle: 'Puerto Rico', latitude: 18.2388, longitude: -66.0352 }, 0)
    const first = evaluateWatchTriggers(watch, [signal('near', 18.5, -66.2, 70), signal('second', 18.3, -66.1, 75)], [], 1_000_000)
    expect(first).toHaveLength(1)
    const repeated = evaluateWatchTriggers(watch, [signal('near', 18.5, -66.2, 70)], first, 1_100_000)
    expect(repeated).toHaveLength(1)
    expect(repeated[0]?.id).toBe(first[0]?.id)
    expect(repeated[0]?.lastSeenAt).toBe(1_100_000)
  })

  it('evaluates forecast thresholds separately from provider delivery logic', () => {
    const watch = createPlaceWatch({ id: 1, name: 'Caguas', subtitle: 'Puerto Rico', latitude: 18.2388, longitude: -66.0352 })
    const context = {
      temperature: 29, apparentTemperature: 32, precipitation: 0, weatherCode: 2, cloudCover: 40, pressure: 1010,
      windSpeed: 20, windDirection: 80, sunrise: '2026-08-21T06:00', sunset: '2026-08-21T18:50', timezone: 'America/Puerto_Rico',
      observedAt: 1, retrievedAt: 2, daily5: [], hourly24: [{ timestamp: 3, localTime: '2026-08-21T15:00', temperature: 30, weatherCode: 80, precipitationProbability: 82, windSpeed: 22 }],
    }
    expect(evaluateWeatherWatch(watch, context, [], 400).reasons).toContain('Rain becomes likely, reaching 82% during the next 24 hours')
  })
})
