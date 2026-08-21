import { afterEach, describe, expect, it, vi } from 'vitest'
import { dedupeLocationLabel, displayTemperature, displayWindSpeed, fetchMarineContext, formatObserverWallTime, observerPlaceSubtitle, parseObserverPlaceQuery } from './openMeteo'

afterEach(() => vi.restoreAllMocks())

describe('Observer location normalization', () => {
  it('removes duplicate administrative labels globally', () => {
    expect(observerPlaceSubtitle({ name: 'Caguas', admin1: 'Caguas', admin2: 'Caguas Municipio', country: 'Puerto Rico', country_code: 'PR' })).toBe('Puerto Rico')
    expect(observerPlaceSubtitle({ name: 'Berlin', admin1: 'Berlin', admin3: 'Berlin, Stadt', country: 'Germany', country_code: 'DE' })).toBe('Germany')
    expect(dedupeLocationLabel('Caguas, Caguas, Puerto Rico')).toBe('Caguas, Puerto Rico')
  })

  it('separates bare names from global disambiguators', () => {
    expect(parseObserverPlaceQuery('Caguas, PR')).toEqual({ name: 'Caguas', qualifiers: ['puerto rico'], countryCode: 'PR' })
    expect(parseObserverPlaceQuery('Los Angeles, CA')).toEqual({ name: 'Los Angeles', qualifiers: ['california'], countryCode: 'US' })
    expect(parseObserverPlaceQuery('Paris, FR')).toEqual({ name: 'Paris', qualifiers: ['france'], countryCode: 'FR' })
  })
})

describe('Observer display units and local time', () => {
  it('converts canonical metric weather without another network request', () => {
    expect(displayTemperature(20, 'fahrenheit')).toBe(68)
    expect(displayTemperature(20, 'celsius')).toBe(20)
    expect(displayWindSpeed(16.09344, 'fahrenheit')).toBeCloseTo(10, 2)
  })

  it('preserves the observed location wall time', () => {
    expect(formatObserverWallTime('2026-08-16T06:14', 'en-US')).toBe('6:14 AM')
    expect(formatObserverWallTime('2026-08-16T18:42', 'en-US')).toBe('6:42 PM')
  })
})

describe('Observer marine context', () => {
  it('normalizes the nearest sea model cell without overstating observation semantics', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      latitude: 18.25, longitude: -65.75,
      current: { time: '2026-08-20T15:00', wave_height: 1.4, wave_direction: 82, wave_period: 8.5, sea_surface_temperature: 29.1, ocean_current_velocity: 1.2, ocean_current_direction: 301 },
    }), { status: 200 }))
    await expect(fetchMarineContext(18.22, -66.04)).resolves.toMatchObject({ waveHeight: 1.4, seaSurfaceTemperature: 29.1, currentDirection: 301 })
  })
})
