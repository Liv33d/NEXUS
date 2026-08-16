import { describe, expect, it } from 'vitest'
import { subsolarPoint } from './solar'

describe('subsolar point', () => {
  it('is close to the equator and prime meridian at the March equinox noon UTC', () => {
    const point = subsolarPoint(new Date('2026-03-20T12:00:00Z'))
    expect(Math.abs(point.latitude)).toBeLessThan(1)
    expect(Math.abs(point.longitude)).toBeLessThan(4)
  })

  it('moves west as UTC advances', () => {
    const noon = subsolarPoint(new Date('2026-06-21T12:00:00Z'))
    const evening = subsolarPoint(new Date('2026-06-21T18:00:00Z'))
    expect(noon.latitude).toBeGreaterThan(23)
    expect(evening.longitude).toBeLessThan(noon.longitude - 80)
  })
})
