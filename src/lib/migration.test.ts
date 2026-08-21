import { describe, expect, it } from 'vitest'
import { buildMigrationSnapshot } from './migration'

const licensed = 'http://creativecommons.org/licenses/by/4.0/legalcode'
const records = (latitude: number, longitude: number, offset = 0) => [0, 1, 2, 3].map((index) => ({
  key: offset + index,
  speciesKey: 2498387,
  species: 'Hirundo rustica',
  vernacularName: 'Barn Swallow',
  decimalLatitude: latitude + index * 0.2,
  decimalLongitude: longitude + index * 0.2,
  coordinateUncertaintyInMeters: 1200,
  license: licensed,
}))

describe('migration evidence', () => {
  it('aggregates exact observations and derives a bounded centroid shift', () => {
    const result = buildMigrationSnapshot(records(36, -82, 20), records(27, -89), Date.parse('2026-05-10T00:00:00Z'))
    expect(result.recentRecordCount).toBe(4)
    expect(result.cells.length).toBeGreaterThan(0)
    expect(result.corridors).toHaveLength(1)
    expect(result.corridors[0]?.species).toBe('Hirundo rustica')
    expect(result.methodology).toContain('not forecasts')
  })

  it('excludes noncommercial and imprecise records', () => {
    const blocked = records(35, -82).map((record, index) => ({ ...record, license: index ? 'CC BY-NC' : licensed, coordinateUncertaintyInMeters: index ? 100 : 80_000 }))
    const result = buildMigrationSnapshot(blocked, blocked)
    expect(result.recentRecordCount).toBe(0)
    expect(result.corridors).toHaveLength(0)
  })
})
