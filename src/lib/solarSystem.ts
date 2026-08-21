import { Body, GeoVector, HelioDistance, HelioVector } from 'astronomy-engine'

export type SolarBodyId = 'mercury' | 'venus' | 'earth' | 'moon' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto'

export interface SolarBodyPosition {
  id: SolarBodyId
  name: string
  x: number
  y: number
  z: number
  distanceAu: number
  radiusKm: number
  color: string
  parent?: SolarBodyId
}

export interface SolarSystemSnapshot {
  timestamp: number
  bodies: SolarBodyPosition[]
  method: string
}

const PLANETS: Array<{ id: Exclude<SolarBodyId, 'moon'>; name: string; body: Body; radiusKm: number; color: string }> = [
  { id: 'mercury', name: 'Mercury', body: Body.Mercury, radiusKm: 2439.7, color: '#a9a7a2' },
  { id: 'venus', name: 'Venus', body: Body.Venus, radiusKm: 6051.8, color: '#dfbd7b' },
  { id: 'earth', name: 'Earth', body: Body.Earth, radiusKm: 6371, color: '#4d91d9' },
  { id: 'mars', name: 'Mars', body: Body.Mars, radiusKm: 3389.5, color: '#bd6444' },
  { id: 'jupiter', name: 'Jupiter', body: Body.Jupiter, radiusKm: 69911, color: '#c8a47d' },
  { id: 'saturn', name: 'Saturn', body: Body.Saturn, radiusKm: 58232, color: '#d7c58d' },
  { id: 'uranus', name: 'Uranus', body: Body.Uranus, radiusKm: 25362, color: '#8ecbd0' },
  { id: 'neptune', name: 'Neptune', body: Body.Neptune, radiusKm: 24622, color: '#5578cc' },
  { id: 'pluto', name: 'Pluto', body: Body.Pluto, radiusKm: 1188.3, color: '#b7a99d' },
]

export function visualSolarDistance(distanceAu: number): number {
  return 5.5 * Math.log10(1 + Math.max(0, distanceAu) * 9)
}

export function getSolarSystemSnapshot(date = new Date()): SolarSystemSnapshot {
  const bodies: SolarBodyPosition[] = PLANETS.map((planet) => {
    const vector = HelioVector(planet.body, date)
    const distanceAu = HelioDistance(planet.body, date)
    const scale = visualSolarDistance(distanceAu) / Math.max(distanceAu, 1e-9)
    return {
      id: planet.id,
      name: planet.name,
      x: vector.x * scale,
      // Astronomy Engine returns J2000 equatorial coordinates. The renderer
      // maps the equatorial Z axis to screen-up while retaining real angles.
      y: vector.z * scale,
      z: vector.y * scale,
      distanceAu,
      radiusKm: planet.radiusKm,
      color: planet.color,
    }
  })
  const earth = bodies.find((body) => body.id === 'earth')!
  const moonVector = GeoVector(Body.Moon, date, true)
  const moonLength = Math.hypot(moonVector.x, moonVector.y, moonVector.z)
  const moonOffset = 0.52
  bodies.push({
    id: 'moon', name: 'Moon', parent: 'earth', radiusKm: 1737.4, color: '#c5c8ca', distanceAu: moonLength,
    x: earth.x + moonVector.x / moonLength * moonOffset,
    y: earth.y + moonVector.z / moonLength * moonOffset,
    z: earth.z + moonVector.y / moonLength * moonOffset,
  })
  return {
    timestamp: date.getTime(),
    bodies,
    method: 'Heliocentric J2000 positions calculated with Astronomy Engine (VSOP87/NOVAS). Orbital angles are real; logarithmic distance and enlarged body sizes are used for legibility.',
  }
}
