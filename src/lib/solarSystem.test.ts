import { describe, expect, it } from 'vitest'
import { getSolarSystemSnapshot, visualSolarDistance } from './solarSystem'

describe('solar system ephemeris', () => {
  it('calculates real bounded heliocentric positions', () => {
    const snapshot = getSolarSystemSnapshot(new Date('2026-08-21T12:00:00Z'))
    expect(snapshot.bodies).toHaveLength(10)
    const earth = snapshot.bodies.find((body) => body.id === 'earth')!
    const neptune = snapshot.bodies.find((body) => body.id === 'neptune')!
    expect(earth.distanceAu).toBeGreaterThan(0.98)
    expect(earth.distanceAu).toBeLessThan(1.02)
    expect(neptune.distanceAu).toBeGreaterThan(28)
    expect(Math.hypot(neptune.x, neptune.y, neptune.z)).toBeGreaterThan(Math.hypot(earth.x, earth.y, earth.z))
  })

  it('uses a monotonic logarithmic visual scale', () => {
    expect(visualSolarDistance(0.4)).toBeLessThan(visualSolarDistance(1))
    expect(visualSolarDistance(1)).toBeLessThan(visualSolarDistance(30))
  })
})
