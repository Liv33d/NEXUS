import { z } from 'zod'
import { validateSignal } from '../lib/signal'
import { buildTemporal, lineage } from '../lib/temporal'
import type { Signal } from '../types/signal'
import { fetchWithTimeout, providerHttpError, type SignalProvider, type SignalQueryContext } from './types'

// NOAA includes forecast rows whose scale and text are explicitly null. Parse
// the complete official document, then derive Signals only from the current row.
const scaleSchema = z.object({
  Scale: z.union([z.string(), z.number()]).nullable(),
  Text: z.string().nullable().optional(),
}).passthrough()
const scalesSchema = z.record(z.string(), z.object({
  DateStamp: z.string().optional(),
  TimeStamp: z.string().optional(),
  R: scaleSchema.optional(),
  S: scaleSchema.optional(),
  G: scaleSchema.optional(),
}).passthrough())

const labels = { R: 'Radio blackout', S: 'Solar radiation storm', G: 'Geomagnetic storm' } as const

export function normalizeSwpc(payload: unknown, retrievedAt = Date.now()): Signal[] {
  const rows = scalesSchema.parse(payload)
  const current = rows['0'] ?? Object.values(rows)[0]
  if (!current) return []
  const date = current.DateStamp && current.TimeStamp ? Date.parse(`${current.DateStamp}T${current.TimeStamp.replace(' ', '')}Z`) : retrievedAt
  return (Object.keys(labels) as Array<keyof typeof labels>).flatMap((code) => {
    const item = current[code]
    const scale = Number(item?.Scale ?? 0)
    if (!Number.isFinite(scale) || scale <= 0) return []
    const observedAt = Number.isFinite(date) ? date : undefined
    const validUntil = retrievedAt + 3 * 3600000
    return [validateSignal({
      id: `swpc-${code.toLowerCase()}-${current.DateStamp ?? 'current'}-${scale}`,
      source: { provider: 'swpc', dataset: 'NOAA Space Weather Scales', url: 'https://www.swpc.noaa.gov/noaa-scales-explanation', retrievedAt, freshness: 'live', ...lineage('noaa-swpc-scales', 'official-product', `${code}-current`, `${current.DateStamp ?? 'unknown'}-${current.TimeStamp ?? 'unknown'}-${scale}`) },
      type: 'space-weather',
      title: `${labels[code]} — ${code}${scale}`,
      summary: item?.Text ?? `${labels[code]} activity is at NOAA scale ${code}${scale}.`,
      timestamp: Number.isFinite(date) ? date : retrievedAt,
      temporal: observedAt === undefined
        ? buildTemporal({ confirmedAt: retrievedAt, validUntil, basis: 'current-state-confirmation' })
        : buildTemporal({ observedAt, confirmedAt: retrievedAt, validUntil, basis: 'sensor-observation' }),
      severity: Math.min(100, 18 + scale * 16),
      confidence: .97,
      entities: [{ id: 'organization-noaa-swpc', type: 'ORGANIZATION', name: 'NOAA Space Weather Prediction Center' }],
      attributes: { scaleFamily: code, scale, global: true },
      provenance: [{ label: 'OFFICIAL_SOURCE', description: 'Current NOAA Space Weather Scale observation.', sourceUrl: 'https://www.swpc.noaa.gov/' }],
      expiresAt: validUntil,
    })]
  })
}

export const swpcProvider: SignalProvider = {
  id: 'swpc',
  name: 'NOAA Space Weather',
  description: 'Current geomagnetic, radiation-storm, and radio-blackout scales.',
  cadenceMs: 5 * 60000,
  dataClass: 'official',
  async isAvailable() { return navigator.onLine },
  async fetchSignals(context: SignalQueryContext) {
    const response = await fetchWithTimeout('https://services.swpc.noaa.gov/products/noaa-scales.json', { signal: context.signal }, 8000)
    if (!response.ok) throw providerHttpError(response, 'swpc')
    return normalizeSwpc(await response.json())
  },
}
