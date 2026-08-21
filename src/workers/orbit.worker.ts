import { degreesLat, degreesLong, ecfToLookAngles, eciToEcf, gstime, json2satrec, propagate, type OMMJsonObject } from 'satellite.js'
import { subsolarPoint } from '../lib/solar'
import type { OrbitalObject, OrbitalPass } from '../lib/orbits'

interface Request { objects: OrbitalObject[]; latitude: number; longitude: number; from: number }
const radians = Math.PI / 180

function solarAltitude(latitude: number, longitude: number, time: number): number {
  const sun = subsolarPoint(new Date(time))
  const lat1 = latitude * radians
  const lat2 = sun.latitude * radians
  const angle = Math.acos(Math.min(1, Math.max(-1, Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos((longitude - sun.longitude) * radians))))
  return 90 - angle / radians
}

function passesFor(object: OrbitalObject, observer: { latitude: number; longitude: number }, from: number): OrbitalPass[] {
  const satrec = json2satrec(object as OMMJsonObject)
  const geodetic = { latitude: observer.latitude * radians, longitude: observer.longitude * radians, height: 0 }
  const results: OrbitalPass[] = []
  let active: { start: number; peak: number; maxElevation: number } | undefined
  for (let offset = 0; offset <= 24 * 60; offset += 1) {
    const time = from + offset * 60_000
    const date = new Date(time)
    const state = propagate(satrec, date)
    if (!state?.position) continue
    const ecf = eciToEcf(state.position, gstime(date))
    const look = ecfToLookAngles(geodetic, ecf)
    const elevation = look.elevation / radians
    if (elevation >= 10) {
      if (!active) active = { start: time, peak: time, maxElevation: elevation }
      if (elevation > active.maxElevation) { active.maxElevation = elevation; active.peak = time }
    } else if (active) {
      if (active.maxElevation >= 18) results.push({ objectName: object.OBJECT_NAME, catalogId: object.NORAD_CAT_ID, ...active, end: time, maxElevation: Math.round(active.maxElevation), darkSky: solarAltitude(observer.latitude, observer.longitude, active.peak) < -6 })
      active = undefined
    }
  }
  return results
}

const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<Request>) => void) | null; postMessage(value: unknown): void }
scope.onmessage = (event) => {
  try {
    const { objects, latitude, longitude, from } = event.data
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('Invalid observer location')
    const passes = objects.flatMap((object) => passesFor(object, { latitude, longitude }, from)).sort((a, b) => a.start - b.start).slice(0, 8)
    scope.postMessage({ passes })
  } catch (error) { scope.postMessage({ error: error instanceof Error ? error.message : 'Orbit calculation failed' }) }
}

// Keep conversion helpers exercised in this worker bundle; they are useful for
// future live sub-satellite points without increasing the UI-thread bundle.
void degreesLat; void degreesLong
