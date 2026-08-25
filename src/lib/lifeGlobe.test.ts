import { describe, expect, it } from 'vitest'
import { buildLifeGlobeSnapshot } from './lifeGlobe'

const licensed = 'http://creativecommons.org/publicdomain/zero/1.0/'

describe('global LIFE context', () => {
  it('summarizes named, licensed taxa without exposing exact coordinates', () => {
    const result = buildLifeGlobeSnapshot([
      { key: 1, speciesKey: 5219404, species: 'Coereba flaveola', vernacularName: 'Bananaquit', kingdom: 'Animalia', class: 'Aves', decimalLatitude: 18.22, decimalLongitude: -66.03, coordinateUncertaintyInMeters: 600, license: licensed },
      { key: 2, speciesKey: 5219404, species: 'Coereba flaveola', vernacularName: 'Bananaquit', kingdom: 'Animalia', class: 'Aves', decimalLatitude: 18.32, decimalLongitude: -66.12, coordinateUncertaintyInMeters: 900, license: licensed },
    ], Date.parse('2026-08-21T12:00:00Z'))
    expect(result.recordCount).toBe(2)
    expect(result.cells).toHaveLength(1)
    expect(result.taxa[0]).toMatchObject({ commonName: 'Bananaquit', scientificName: 'Coereba flaveola', observations: 2 })
    expect(result.methodology).toContain('coarse H3 cells')
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
})
