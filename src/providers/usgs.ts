import { z } from 'zod'
import { validateSignal } from '../lib/signal'
import type { Signal } from '../types/signal'
import { fetchWithTimeout, ProviderError, type SignalProvider, type SignalQueryContext } from './types'

const featureCollectionSchema = z.object({
  features: z.array(z.object({
    id: z.string(),
    properties: z.object({
      mag: z.number().nullable(), place: z.string().nullable(), time: z.number(), updated: z.number(),
      url: z.string().url(), detail: z.string().url().optional(), felt: z.number().nullable().optional(),
      cdi: z.number().nullable().optional(), mmi: z.number().nullable().optional(), alert: z.string().nullable().optional(),
      status: z.string().optional(), tsunami: z.number().optional(), sig: z.number().optional(), type: z.string().optional(), title: z.string(),
    }),
    geometry: z.object({ type: z.literal('Point'), coordinates: z.tuple([z.number(), z.number(), z.number().optional()]) }),
  })).max(20000),
})

function severity(magnitude: number | null, significance = 0, alert?: string | null): number {
  const alertBoost = alert === 'red' ? 30 : alert === 'orange' ? 20 : alert === 'yellow' ? 10 : 0
  return Math.min(100, Math.max(4, (magnitude ?? 0) * 11 + significance / 30 + alertBoost))
}

export function normalizeUsgs(payload: unknown, retrievedAt = Date.now()): Signal[] {
  const collection = featureCollectionSchema.parse(payload)
  return collection.features.map((feature) => {
    const [longitude, latitude, depth = 0] = feature.geometry.coordinates
    const p = feature.properties
    return validateSignal({
      id: `usgs-${feature.id}`,
      source: { provider: 'usgs', dataset: 'USGS Earthquakes GeoJSON', url: p.url, retrievedAt, freshness: 'live' },
      type: 'earthquake',
      title: p.title,
      summary: `${p.mag == null ? 'Unrated' : `Magnitude ${p.mag}`} earthquake${p.place ? ` near ${p.place}` : ''}; depth ${Math.round(depth)} km.`,
      timestamp: p.time,
      location: { latitude, longitude, altitude: -depth * 1000 },
      geometry: feature.geometry,
      magnitude: p.mag ?? undefined,
      severity: severity(p.mag, p.sig, p.alert),
      confidence: p.status === 'reviewed' ? 0.98 : 0.86,
      entities: p.place ? [{ id: `location-${p.place.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, type: 'LOCATION', name: p.place }] : [],
      attributes: { depthKm: depth, feltReports: p.felt, cdi: p.cdi, mmi: p.mmi, alert: p.alert, tsunami: Boolean(p.tsunami), significance: p.sig, updatedAt: p.updated, status: p.status },
      provenance: [{ label: 'OFFICIAL_SOURCE', description: 'United States Geological Survey real-time earthquake feed.', sourceUrl: p.url }],
      expiresAt: retrievedAt + 30 * 86400000,
    })
  })
}

export const usgsProvider: SignalProvider = {
  id: 'usgs',
  name: 'USGS Earthquakes',
  async isAvailable() { return navigator.onLine },
  async fetchSignals(context: SignalQueryContext) {
    const hours = (context.until - context.since) / 3600000
    const feed = hours <= 1 ? 'all_hour' : hours <= 24 ? 'all_day' : 'all_week'
    const response = await fetchWithTimeout(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feed}.geojson`, { signal: context.signal }, 7000)
    if (!response.ok) throw new ProviderError(`USGS returned ${response.status}`, 'usgs')
    return normalizeUsgs(await response.json())
  },
}
