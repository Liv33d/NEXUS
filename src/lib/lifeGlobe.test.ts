import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildLifeGlobeSnapshot, fetchLifeGlobeSnapshot, LIFE_CACHE_MAX_AGE, lifeGlobeCacheKey } from './lifeGlobe'

const licensed = 'http://creativecommons.org/publicdomain/zero/1.0/'

describe('global LIFE context', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('summarizes named, licensed taxa without exposing exact coordinates', () => {
    const result = buildLifeGlobeSnapshot(Array.from({ length: 10 }, (_, index) => ({
      key: index + 1, speciesKey: 5219404, species: 'Coereba flaveola', vernacularName: 'Bananaquit', kingdom: 'Animalia', class: 'Aves',
      decimalLatitude: 18.22 + index * .002, decimalLongitude: -66.03 + index * .002, coordinateUncertaintyInMeters: 600, license: licensed,
    })), Date.parse('2026-08-21T12:00:00Z'))
    expect(result.recordCount).toBe(10)
    expect(result.cells).toHaveLength(1)
    expect(result.taxa[0]).toMatchObject({ commonName: 'Bananaquit', scientificName: 'Coereba flaveola', observations: 10 })
    expect(result.methodology).toContain('coarse H3 resolution 3 cells')
    expect(result.methodology).toContain('at least 5 records')
    expect(result.taxa[0]?.latitude).not.toBeCloseTo(18.229, 3)
  })

  it('suppresses low-n cells and taxa instead of publishing sensitive points', () => {
    const result = buildLifeGlobeSnapshot(Array.from({ length: 9 }, (_, index) => ({
      key: index + 1, speciesKey: 5219404, species: 'Coereba flaveola', decimalLatitude: 18.22, decimalLongitude: -66.03,
      coordinateUncertaintyInMeters: 600, license: licensed,
    })))
    expect(result.recordCount).toBe(9)
    expect(result.cells).toEqual([])
    expect(result.taxa[0]?.observations).toBe(9)

    const lowTaxon = buildLifeGlobeSnapshot([
      ...Array.from({ length: 4 }, (_, index) => ({ key: index + 1, speciesKey: 1, species: 'Sensitive bird', decimalLatitude: 18.22, decimalLongitude: -66.03, license: licensed })),
      ...Array.from({ length: 6 }, (_, index) => ({ key: index + 10, speciesKey: 2, species: 'Common bird', decimalLatitude: 18.22, decimalLongitude: -66.03, license: licensed })),
    ])
    expect(lowTaxon.cells).toHaveLength(1)
    expect(lowTaxon.taxa.map((taxon) => taxon.scientificName)).toEqual(['Common bird'])
  })

  it('rejects noncommercial and excessively imprecise records', () => {
    const result = buildLifeGlobeSnapshot([
      { key: 1, speciesKey: 1, species: 'Blocked bird', decimalLatitude: 10, decimalLongitude: 10, license: 'CC BY-NC' },
      { key: 2, speciesKey: 2, species: 'Imprecise plant', decimalLatitude: 11, decimalLongitude: 11, coordinateUncertaintyInMeters: 80_000, license: licensed },
      { key: 3, speciesKey: 3, species: 'Attribution pending', decimalLatitude: 12, decimalLongitude: 12, license: 'http://creativecommons.org/licenses/by/4.0/legalcode' },
    ])
    expect(result.recordCount).toBe(0)
    expect(result.taxa).toHaveLength(0)
  })

  it('separates cache entries by query radius, date window, and privacy policy', () => {
    const small = lifeGlobeCacheKey(18.22, -66.03, 120, 2026)
    const large = lifeGlobeCacheKey(18.22, -66.03, 1_000, 2026)
    const shiftedCenter = lifeGlobeCacheKey(18.24, -66.01, 120, 2026)
    expect(small).not.toBe(large)
    expect(small).not.toBe(shiftedCenter)
    expect(small.split(':')[3]).toBe(shiftedCenter.split(':')[3])
    expect(small).toContain(':r100:y2025-2026:cc0-k10-k5')
  })

  it('refuses hard-expired LIFE evidence when the provider is offline', async () => {
    const now = Date.UTC(2026, 7, 27, 12)
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const key = lifeGlobeCacheKey(18.22, -66.03, 120, 2026)
    localStorage.setItem(key, JSON.stringify({ queryKey: key, cells: [], taxa: [], recordCount: 0, retrievedAt: now - LIFE_CACHE_MAX_AGE - 1, freshness: 'live', methodology: 'Expired fixture.' }))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(fetchLifeGlobeSnapshot(18.22, -66.03, 120)).rejects.toThrow('offline')
    expect(localStorage.getItem(key)).toBeNull()
  })
})
