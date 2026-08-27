import { z } from 'zod'
import { validateSignal } from '../lib/signal'
import { buildTemporal, lineage } from '../lib/temporal'
import type { Signal, SignalType } from '../types/signal'
import { fetchWithTimeout, providerHttpError, type SignalProvider, type SignalQueryContext } from './types'

const scalar = z.union([z.string(), z.number()])
const gdacsSchema = z.object({
  type: z.literal('FeatureCollection').optional(),
  features: z.array(z.object({
    type: z.literal('Feature').optional(),
    geometry: z.object({ type: z.literal('Point'), coordinates: z.array(z.number()).min(2).max(3) }),
    properties: z.object({
      eventid: scalar,
      episodeid: scalar.optional(),
      eventtype: z.string().max(8),
      name: z.string().max(300).nullable().optional(),
      alertlevel: z.string().max(20).nullable().optional(),
      alertscore: z.number().nullable().optional(),
      episodealertlevel: z.union([z.string(), z.array(z.string())]).nullable().optional(),
      episodealertscore: z.union([z.number(), z.array(z.number())]).nullable().optional(),
      fromdate: z.string().nullable().optional(),
      todate: z.string().nullable().optional(),
      datemodified: z.string().nullable().optional(),
      country: z.union([z.string(), z.array(z.string())]).nullable().optional(),
      severitydata: z.unknown().optional(),
      population: z.unknown().optional(),
      vulnerability: z.unknown().optional(),
      url: z.union([z.string(), z.object({ details: z.string().optional(), geometry: z.string().optional() })]).nullable().optional(),
      source: z.string().nullable().optional(),
    }).passthrough(),
  })).max(1000),
})

const eventType: Record<string, { type: SignalType; label: string }> = {
  TC: { type: 'weather', label: 'Tropical cyclone' },
  FL: { type: 'weather', label: 'Flood' },
  VO: { type: 'environment', label: 'Volcanic activity' },
  DR: { type: 'environment', label: 'Drought' },
  WF: { type: 'fire', label: 'Wildfire' },
}

function parsedTime(value: string | null | undefined, fallback: number): number {
  const time = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(time) ? time : fallback
}

function latest<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value.at(-1) : value ?? undefined
}

function detailsUrl(value: z.infer<typeof gdacsSchema>['features'][number]['properties']['url']): string | undefined {
  const candidate = typeof value === 'string' ? value : value?.details
  if (!candidate) return undefined
  try { return new URL(candidate).protocol === 'https:' ? candidate : undefined } catch { return undefined }
}

function alertSeverity(level: string, score?: number): number {
  const base = ({ red: 91, orange: 68, green: 36 } as Record<string, number>)[level.toLowerCase()] ?? 32
  return Math.min(100, base + Math.max(0, Math.min(7, score ?? 0)))
}

export function normalizeGdacs(payload: unknown, retrievedAt = Date.now()): Signal[] {
  const collection = gdacsSchema.parse(payload)
  return collection.features.flatMap((feature) => {
    const properties = feature.properties
    const descriptor = eventType[properties.eventtype.toUpperCase()]
    if (!descriptor) return []
    const [longitude, latitude] = feature.geometry.coordinates
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude!) > 90 || Math.abs(longitude!) > 180) return []
    const level = latest(properties.episodealertlevel) ?? properties.alertlevel ?? 'Green'
    const score = latest(properties.episodealertscore) ?? properties.alertscore ?? undefined
    const country = Array.isArray(properties.country) ? properties.country.join(', ') : properties.country ?? undefined
    const name = properties.name?.trim() || country || `Event ${properties.eventid}`
    const sourceUrl = detailsUrl(properties.url)
    const startTime = parsedTime(properties.fromdate, retrievedAt)
    const endTime = properties.todate ? parsedTime(properties.todate, retrievedAt + 7 * 86_400_000) : undefined
    const modifiedAt = properties.datemodified ? parsedTime(properties.datemodified, retrievedAt) : undefined
    const upstreamKey = `gdacs:${properties.eventtype.toLowerCase()}:${properties.eventid}`
    const revisionKey = String(properties.episodeid ?? modifiedAt ?? 'current')
    const upstreamRefs = properties.source?.trim() ? [{ sourceFamily: `gdacs-source:${properties.source.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}` }] : []
    return [validateSignal({
      id: `gdacs-${properties.eventtype.toLowerCase()}-${properties.eventid}`,
      source: { provider: 'gdacs', dataset: 'GDACS global disaster alerts', url: sourceUrl, retrievedAt, freshness: 'delayed', ...lineage('gdacs', 'aggregator', upstreamKey, revisionKey, upstreamRefs) },
      type: descriptor.type,
      title: `${descriptor.label} alert — ${name}`,
      summary: `${level} GDACS alert${country ? ` affecting ${country}` : ''}. This is a global hazard-impact screening signal, not a local emergency warning.`,
      timestamp: startTime,
      startTime,
      endTime,
      temporal: buildTemporal({ updatedAt: modifiedAt, validFrom: startTime, validUntil: endTime, confirmedAt: retrievedAt, basis: 'product-validity' }),
      location: { latitude: latitude!, longitude: longitude! },
      geometry: { type: 'Point', coordinates: [longitude!, latitude!] },
      severity: alertSeverity(level, score),
      confidence: .8,
      entities: [
        { id: `gdacs-event-${properties.eventtype.toLowerCase()}-${properties.eventid}`, type: 'EVENT', name },
        ...(country ? [{ id: `country-${country.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, type: 'COUNTRY' as const, name: country }] : []),
      ],
      attributes: { eventId: String(properties.eventid), episodeId: properties.episodeid ? String(properties.episodeid) : undefined, eventType: properties.eventtype, alertLevel: level, alertScore: score, country, source: properties.source, severityData: properties.severitydata, population: properties.population, vulnerability: properties.vulnerability, modifiedAt: properties.datemodified },
      provenance: [{ label: 'OPEN_DATA', description: 'GDACS is a UN–European Commission cooperation framework. Its automated impact alerts aggregate upstream hazard and exposure information and may change as an event develops.', sourceUrl }],
      expiresAt: endTime ?? retrievedAt + 14 * 86_400_000,
    })]
  })
}

export const gdacsProvider: SignalProvider = {
  id: 'gdacs',
  name: 'GDACS Alerts',
  description: 'Global cyclone, flood, volcano, drought, and wildfire impact alerts.',
  cadenceMs: 30 * 60_000,
  dataClass: 'open-data',
  async isAvailable() { return navigator.onLine },
  async fetchSignals(context: SignalQueryContext) {
    const date = (time: number) => new Date(time).toISOString().slice(0, 10)
    const params = new URLSearchParams({ eventlist: 'TC,FL,VO,DR,WF', alertlevel: 'Green;Orange;Red', fromDate: date(Math.max(context.since, context.until - 30 * 86_400_000)), toDate: date(context.until) })
    const response = await fetchWithTimeout(`https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?${params}`, { signal: context.signal }, 12_000)
    if (!response.ok) throw providerHttpError(response, 'gdacs')
    return normalizeGdacs(await response.json()).filter((signal) => signal.timestamp >= context.since || (signal.endTime ?? 0) >= context.since)
  },
}
