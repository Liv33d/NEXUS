import { afterEach, describe, expect, it, vi } from 'vitest'
import { dedupeLocationLabel, displayPrecipitation, displayPressure, displayTemperature, displayVisibility, displayWindSpeed, fetchMarineContext, fetchObserverContext, formatObserverWallTime, observerPlaceSubtitle, parseObserverPlaceQuery } from './openMeteo'

afterEach(() => vi.restoreAllMocks())

describe('Observer location normalization', () => {
  it('removes duplicate administrative labels globally', () => {
    expect(observerPlaceSubtitle({ name: 'Caguas', admin1: 'Caguas', admin2: 'Caguas Municipio', country: 'Puerto Rico', country_code: 'PR' })).toBe('Puerto Rico')
    expect(observerPlaceSubtitle({ name: 'Caguas', admin1: 'Cañabón Barrio', admin2: 'Caguas', country: 'PR', country_code: 'PR' })).toBe('Puerto Rico')
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
    expect(displayPrecipitation(25.4, 'fahrenheit')).toBeCloseTo(1, 4)
    expect(displayVisibility(1609.344, 'fahrenheit')).toBeCloseTo(1, 4)
    expect(displayPressure(1013.25, 'fahrenheit')).toBeCloseTo(29.92, 2)
  })

  it('preserves the observed location wall time', () => {
    expect(formatObserverWallTime('2026-08-16T06:14', 'en-US')).toBe('6:14 AM')
    expect(formatObserverWallTime('2026-08-16T18:42', 'en-US')).toBe('6:42 PM')
  })
})

describe('Observer forecast normalization', () => {
  it('keeps model forecast and current-condition timestamps explicit', async () => {
    const hourlyTimes = Array.from({ length: 30 }, (_, index) => `2026-08-21T${String(index % 24).padStart(2, '0')}:00`)
    const values = Array.from({ length: 30 }, (_, index) => 25 + index / 10)
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        latitude: 18.24, longitude: -66.04, timezone: 'America/Puerto_Rico', utc_offset_seconds: -14400,
        current: { time: '2026-08-21T10:00', temperature_2m: 29, apparent_temperature: 33, precipitation: 0.2, weather_code: 2, cloud_cover: 44, surface_pressure: 1009, wind_speed_10m: 18, wind_direction_10m: 84, relative_humidity_2m: 74, visibility: 16000, is_day: 1 },
        hourly: { time: hourlyTimes, temperature_2m: values, apparent_temperature: values, precipitation_probability: values.map(() => 20), precipitation: values.map(() => 0), rain: values.map(() => 0), snowfall: values.map(() => 0), weather_code: values.map(() => 2), cloud_cover: values.map(() => 40), wind_speed_10m: values.map(() => 15), wind_direction_10m: values.map(() => 80) },
        daily: { time: ['2026-08-21','2026-08-22','2026-08-23','2026-08-24','2026-08-25','2026-08-26'], sunrise: Array(6).fill('2026-08-21T06:05'), sunset: Array(6).fill('2026-08-21T18:50'), weather_code: Array(6).fill(2), temperature_2m_max: Array(6).fill(31), temperature_2m_min: Array(6).fill(24), precipitation_probability_max: Array(6).fill(35), precipitation_sum: Array(6).fill(2.2), wind_speed_10m_max: Array(6).fill(24) },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ current: { time: '2026-08-21T10:00', us_aqi: 31, pm2_5: 7 } }), { status: 200 }))
    const context = await fetchObserverContext(18.24, -66.04)
    expect(context.hourly24).toHaveLength(14)
    expect(context.daily5).toHaveLength(5)
    expect(context.relativeHumidity).toBe(74)
    expect(context.visibility).toBe(16000)
    expect(context.observedAt).toBe(Date.parse('2026-08-21T14:00:00Z'))
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
