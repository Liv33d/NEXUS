import { z } from 'zod'
import { validateSignal } from '../lib/signal'
import { sanitizeAreaGeometry } from '../lib/geospatial'
import type { Signal } from '../types/signal'
import { fetchWithTimeout, providerHttpError, type SignalProvider, type SignalQueryContext } from './types'

const coordinate = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
const featureSchema = z.object({
  type: z.literal('Feature'),
  properties: z.object({ stormId: z.string().max(40), name: z.string().max(300), product: z.enum(['cone', 'track']), sourceUrl: z.string().url() }),
  geometry: z.discriminatedUnion('type', [
    z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(coordinate).min(4)).min(1) }),
    z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(z.array(coordinate).min(4)).min(1)).min(1) }),
    z.object({ type: z.literal('LineString'), coordinates: z.array(coordinate).min(2) }),
  ]),
})
const snapshotSchema = z.object({ generatedAt: z.string().nullable(), features: z.array(featureSchema).max(30) })

const cleanName = (value: string) => value.replace(/\s*\(Advisory[^)]*\).*$/i, '').replace(/\s*[-–—]\s*Forecast.*$/i, '').trim()

export function normalizeNhc(payload: unknown, retrievedAt = Date.now()): Signal[] {
  const snapshot = snapshotSchema.parse(payload)
  const generatedAt = snapshot.generatedAt ? Date.parse(snapshot.generatedAt) : retrievedAt
  const groups = new Map<string, Array<z.infer<typeof featureSchema>>>()
  for (const feature of snapshot.features) groups.set(feature.properties.stormId, [...(groups.get(feature.properties.stormId) ?? []), feature])
  return [...groups.entries()].flatMap(([stormId, features]) => {
    const cone = features.find((feature) => feature.properties.product === 'cone' && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon'))
    const track = features.find((feature) => feature.properties.product === 'track' && feature.geometry.type === 'LineString')
    const trackCoordinates = track?.geometry.type === 'LineString' ? track.geometry.coordinates : []
    const center = trackCoordinates[0] ?? (cone?.geometry.type === 'Polygon' ? cone.geometry.coordinates[0]?.[0] : cone?.geometry.type === 'MultiPolygon' ? cone.geometry.coordinates[0]?.[0]?.[0] : undefined)
    if (!center) return []
    const name = cleanName(track?.properties.name ?? cone?.properties.name ?? stormId.toUpperCase())
    const severity = /major|category [3-5]/i.test(name) ? 92 : /hurricane|typhoon/i.test(name) ? 82 : /tropical storm|cyclone/i.test(name) ? 68 : 55
    const sourceUrl = track?.properties.sourceUrl ?? cone?.properties.sourceUrl
    return [validateSignal({
      id: `nhc-${stormId}`,
      source: { provider: 'nhc', dataset: 'NHC active tropical cyclone GIS', url: sourceUrl, retrievedAt, freshness: retrievedAt - generatedAt < 4 * 3600000 ? 'live' : 'cached' },
      type: 'weather', title: name, summary: 'Official forecast track and uncertainty geometry from the NOAA National Hurricane Center. Forecast positions and cones describe uncertainty, not a guaranteed path.',
      timestamp: generatedAt, location: { longitude: center[0], latitude: center[1] },
      geometry: cone ? sanitizeAreaGeometry(cone.geometry as GeoJSON.Geometry) : undefined,
      severity, confidence: .98,
      entities: [{ id: `cyclone-${stormId}`, type: 'EVENT', name }],
      attributes: { stormId, forecastTrack: trackCoordinates, generatedAt: snapshot.generatedAt, geometryAuthority: 'NOAA National Hurricane Center' },
      provenance: [{ label: 'OFFICIAL_SOURCE', description: 'Forecast geometry is published by NOAA/NHC and refreshed by the NEXUS static data build. NHC warns that internet delivery is not guaranteed for life-safety decisions.', sourceUrl }],
      expiresAt: generatedAt + 8 * 3600000,
    })]
  })
}

export const nhcProvider: SignalProvider = {
  id: 'nhc', name: 'NHC Cyclones', description: 'Authoritative active tropical-cyclone tracks and forecast uncertainty geometry.', cadenceMs: 2 * 3600000, dataClass: 'official',
  async isAvailable() { return navigator.onLine },
  async fetchSignals(context: SignalQueryContext) {
    const response = await fetchWithTimeout(`${import.meta.env.BASE_URL}data/nhc-cyclones.json`, { signal: context.signal }, 6000)
    if (!response.ok) throw providerHttpError(response, 'nhc')
    return normalizeNhc(await response.json())
  },
}
