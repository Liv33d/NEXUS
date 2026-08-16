import { describe, expect, it } from 'vitest'
import { dedupeLocationLabel, displayTemperature, displayWindSpeed, formatObserverWallTime, observerPlaceSubtitle, parseObserverPlaceQuery } from './openMeteo'

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
