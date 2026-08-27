import { z } from 'zod'
import { validateSignal } from '../lib/signal'
import { buildTemporal, lineage } from '../lib/temporal'
import type { Signal, SignalType } from '../types/signal'
import { fetchWithTimeout, providerHttpError, type SignalProvider, type SignalQueryContext } from './types'

const eonetSchema = z.object({
  features: z.array(z.object({
    type: z.literal('Feature'),
    geometry: z.object({ type: z.enum(['Point', 'Polygon']), coordinates: z.unknown() }),
    properties: z.object({
      id: z.string().max(120),
      title: z.string().max(300),
      description: z.string().max(3000).nullable().optional(),
      link: z.string().url().optional(),
      closed: z.string().nullable().optional(),
      date: z.string(),
      magnitudeValue: z.number().nullable().optional(),
      magnitudeUnit: z.string().nullable().optional(),
      magnitudeDescription: z.string().nullable().optional(),
      categories: z.array(z.object({ id: z.string(), title: z.string() })).max(10),
      sources: z.array(z.object({ id: z.string(), url: z.string().url().optional() })).max(20),
    }),
  })).max(5000),
})

const categoryType: Record<string, SignalType> = {
  wildfires: 'fire', severeStorms: 'weather', floods: 'weather', drought: 'environment', dustHaze: 'environment',
  volcanoes: 'environment', landslides: 'environment', seaLakeIce: 'environment', snow: 'weather', tempExtremes: 'weather',
  waterColor: 'environment', manmade: 'infrastructure',
}

const categorySeverity: Record<string, number> = {
  wildfires: 64, severeStorms: 72, floods: 68, volcanoes: 66, landslides: 62, drought: 48,
  dustHaze: 44, seaLakeIce: 36, snow: 42, tempExtremes: 56, waterColor: 30, manmade: 55,
}

function centerOfGeometry(geometry: z.infer<typeof eonetSchema>['features'][number]['geometry']): { latitude: number; longitude: number } | undefined {
  if (geometry.type === 'Point' && Array.isArray(geometry.coordinates) && typeof geometry.coordinates[0] === 'number' && typeof geometry.coordinates[1] === 'number') {
    return { longitude: geometry.coordinates[0], latitude: geometry.coordinates[1] }
  }
  const points: Array<[number, number]> = []
  const walk = (value: unknown): void => {
    if (!Array.isArray(value)) return
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') { points.push([value[0], value[1]]); return }
    value.forEach(walk)
  }
  walk(geometry.coordinates)
  if (!points.length) return undefined
  return { longitude: points.reduce((sum, point) => sum + point[0], 0) / points.length, latitude: points.reduce((sum, point) => sum + point[1], 0) / points.length }
}

export function normalizeEonet(payload: unknown, retrievedAt = Date.now()): Signal[] {
  const collection = eonetSchema.parse(payload)
  const latest = new Map<string, (typeof collection.features)[number]>()
  for (const feature of collection.features) {
    const prior = latest.get(feature.properties.id)
    if (!prior || Date.parse(feature.properties.date) > Date.parse(prior.properties.date)) latest.set(feature.properties.id, feature)
  }
  return [...latest.values()].flatMap((feature) => {
    const p = feature.properties
    const location = centerOfGeometry(feature.geometry)
    if (!location || Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180) return []
    const category = p.categories[0]
    const sourceUrl = p.sources.find((source) => source.url)?.url ?? p.link
    const observedAt = Date.parse(p.date)
    const closedAt = p.closed ? Date.parse(p.closed) : undefined
    const upstreamRefs = p.sources.map((source) => ({ sourceFamily: `eonet-source:${source.id.toLowerCase()}`, ...(source.url ? { url: source.url } : {}) }))
    const magnitudeBoost = typeof p.magnitudeValue === 'number' ? Math.min(18, Math.log10(Math.max(1, Math.abs(p.magnitudeValue))) * 5) : 0
    return [validateSignal({
      id: `eonet-${p.id}`,
      source: { provider: 'eonet', dataset: 'NASA EONET v3', url: sourceUrl ?? p.link, retrievedAt, freshness: 'delayed', ...lineage('nasa-eonet', 'aggregator', `eonet:${p.id}`, String(observedAt), upstreamRefs) },
      type: categoryType[category?.id ?? ''] ?? 'environment',
      title: p.title,
      summary: p.description ?? `${category?.title ?? 'Natural event'} tracked by NASA's Earth Observatory Natural Event Tracker.`,
      timestamp: observedAt,
      endTime: closedAt,
      temporal: buildTemporal({ observedAt, validUntil: closedAt, confirmedAt: retrievedAt, basis: closedAt ? 'event-occurrence' : 'current-state-confirmation' }),
      location,
      geometry: feature.geometry as GeoJSON.Geometry,
      magnitude: p.magnitudeValue ?? undefined,
      severity: Math.min(100, (categorySeverity[category?.id ?? ''] ?? 42) + magnitudeBoost),
      confidence: .82,
      entities: [{ id: `event-${p.id.toLowerCase()}`, type: 'EVENT', name: p.title }],
      attributes: { categories: p.categories, sourceIds: p.sources.map((source) => source.id), magnitudeUnit: p.magnitudeUnit, magnitudeDescription: p.magnitudeDescription, open: !p.closed },
      provenance: [{ label: 'OPEN_DATA', description: 'NASA EONET aggregates authoritative natural-event sources; event timing may be delayed.', sourceUrl }],
      expiresAt: retrievedAt + 14 * 86400000,
    })]
  })
}

export const eonetProvider: SignalProvider = {
  id: 'eonet',
  name: 'NASA EONET',
  description: 'Global wildfires, severe storms, volcanoes, floods, and other natural events.',
  cadenceMs: 15 * 60000,
  dataClass: 'open-data',
  async isAvailable() { return navigator.onLine },
  async fetchSignals(context: SignalQueryContext) {
    const days = Math.max(1, Math.min(30, Math.ceil((context.until - context.since) / 86400000)))
    const response = await fetchWithTimeout(`https://eonet.gsfc.nasa.gov/api/v3/events/geojson?status=open&days=${days}&limit=500`, { signal: context.signal }, 9000)
    if (!response.ok) throw providerHttpError(response, 'eonet')
    return normalizeEonet(await response.json())
  },
}
