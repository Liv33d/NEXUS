import { z } from 'zod'
import { validateSignal } from '../lib/signal'
import type { Signal } from '../types/signal'
import { fetchWithTimeout, providerHttpError, type SignalProvider, type SignalQueryContext } from './types'

const geometrySchema = z.object({
  type: z.enum(['Point', 'Polygon', 'MultiPolygon']),
  coordinates: z.unknown(),
})

const alertCollectionSchema = z.object({
  features: z.array(z.object({
    id: z.string().max(500),
    geometry: geometrySchema.nullable(),
    properties: z.object({
      id: z.string().max(500).optional(),
      areaDesc: z.string().max(1000).nullable().optional(),
      sent: z.string().nullable().optional(),
      effective: z.string().nullable().optional(),
      onset: z.string().nullable().optional(),
      expires: z.string().nullable().optional(),
      ends: z.string().nullable().optional(),
      status: z.string().nullable().optional(),
      messageType: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
      severity: z.string().nullable().optional(),
      certainty: z.string().nullable().optional(),
      urgency: z.string().nullable().optional(),
      event: z.string().max(240),
      senderName: z.string().max(240).nullable().optional(),
      headline: z.string().max(500).nullable().optional(),
      description: z.string().max(20000).nullable().optional(),
      instruction: z.string().max(20000).nullable().optional(),
    }),
  })).max(10000),
})

function finiteCoordinates(value: unknown, output: Array<[number, number]>): void {
  if (!Array.isArray(value)) return
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    if (Number.isFinite(value[0]) && Number.isFinite(value[1]) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90) output.push([value[0], value[1]])
    return
  }
  for (const child of value) finiteCoordinates(child, output)
}

function geometryCenter(geometry: z.infer<typeof geometrySchema> | null): { latitude: number; longitude: number } | undefined {
  if (!geometry) return undefined
  const points: Array<[number, number]> = []
  finiteCoordinates(geometry.coordinates, points)
  if (!points.length) return undefined
  const bounds = points.reduce((acc, [lng, lat]) => ({ minLng: Math.min(acc.minLng, lng), maxLng: Math.max(acc.maxLng, lng), minLat: Math.min(acc.minLat, lat), maxLat: Math.max(acc.maxLat, lat) }), { minLng: 180, maxLng: -180, minLat: 90, maxLat: -90 })
  return { latitude: (bounds.minLat + bounds.maxLat) / 2, longitude: (bounds.minLng + bounds.maxLng) / 2 }
}

function alertSeverity(level?: string | null, urgency?: string | null): number {
  const base: Record<string, number> = { Extreme: 94, Severe: 76, Moderate: 52, Minor: 28, Unknown: 20 }
  const urgencyBoost = urgency === 'Immediate' ? 5 : urgency === 'Expected' ? 2 : 0
  return Math.min(100, (base[level ?? 'Unknown'] ?? 20) + urgencyBoost)
}

function confidence(certainty?: string | null): number {
  return ({ Observed: .98, Likely: .86, Possible: .66, Unlikely: .4, Unknown: .55 } as Record<string, number>)[certainty ?? 'Unknown'] ?? .55
}

function time(value?: string | null, fallback = Date.now()): number {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

export function normalizeNws(payload: unknown, retrievedAt = Date.now()): Signal[] {
  const collection = alertCollectionSchema.parse(payload)
  return collection.features.flatMap((feature) => {
    const p = feature.properties
    const location = geometryCenter(feature.geometry)
    if (!location) return []
    // CAP identifies alerts with a URN, while the GeoJSON feature id is the
    // canonical HTTPS API document. Keep the URN as identity, never as a link.
    const sourceUrl = feature.id
    const alertId = p.id ?? feature.id
    const area = p.areaDesc?.split(';')[0]?.trim()
    return [validateSignal({
      id: `nws-${encodeURIComponent(alertId).slice(-180)}`,
      source: { provider: 'nws', dataset: 'NWS Active Alerts', url: sourceUrl, retrievedAt, freshness: 'live' },
      type: 'weather',
      title: `${p.event}${area ? ` — ${area}` : ''}`,
      summary: p.headline ?? p.description?.slice(0, 700) ?? `${p.event} issued by the National Weather Service.`,
      timestamp: time(p.onset ?? p.effective ?? p.sent, retrievedAt),
      startTime: time(p.effective ?? p.sent, retrievedAt),
      endTime: time(p.ends ?? p.expires, retrievedAt + 6 * 3600000),
      location,
      geometry: feature.geometry as GeoJSON.Geometry,
      severity: alertSeverity(p.severity, p.urgency),
      confidence: confidence(p.certainty),
      entities: area ? [{ id: `region-${area.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, type: 'REGION', name: area }] : [],
      attributes: { event: p.event, areaDescription: p.areaDesc, severity: p.severity, certainty: p.certainty, urgency: p.urgency, status: p.status, messageType: p.messageType, category: p.category, senderName: p.senderName, instruction: p.instruction?.slice(0, 2000) },
      provenance: [{ label: 'OFFICIAL_SOURCE', description: 'Official active alert from the U.S. National Weather Service.', sourceUrl }],
      expiresAt: time(p.ends ?? p.expires, retrievedAt + 24 * 3600000),
    })]
  })
}

export const nwsProvider: SignalProvider = {
  id: 'nws',
  name: 'NWS Alerts',
  description: 'Active U.S. severe-weather watches, warnings, and advisories.',
  cadenceMs: 3 * 60000,
  dataClass: 'official',
  async isAvailable() { return navigator.onLine },
  async fetchSignals(context: SignalQueryContext) {
    // NEXUS is a situation-awareness surface, not an all-advisories directory.
    // Filtering server-side keeps the mobile payload bounded (the unfiltered
    // national feed can be many times larger) while retaining urgent hazards.
    const params = new URLSearchParams({ status: 'actual', message_type: 'alert', severity: 'Severe,Extreme' })
    const response = await fetchWithTimeout(`https://api.weather.gov/alerts/active?${params}`, { signal: context.signal, headers: { Accept: 'application/geo+json' } }, 18000)
    if (!response.ok) throw providerHttpError(response, 'nws')
    return normalizeNws(await response.json()).filter((signal) => !signal.endTime || signal.endTime >= context.since)
  },
}
