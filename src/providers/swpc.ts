import { z } from 'zod'
import { validateSignal } from '../lib/signal'
import type { Signal } from '../types/signal'
import { fetchWithTimeout, providerHttpError, type SignalProvider, type SignalQueryContext } from './types'

const scaleSchema = z.object({ Scale: z.union([z.string(), z.number()]), Text: z.string().optional() }).passthrough()
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
    return [validateSignal({
      id: `swpc-${code.toLowerCase()}-${current.DateStamp ?? 'current'}-${scale}`,
      source: { provider: 'swpc', dataset: 'NOAA Space Weather Scales', url: 'https://www.swpc.noaa.gov/noaa-scales-explanation', retrievedAt, freshness: 'live' },
      type: 'space-weather',
      title: `${labels[code]} — ${code}${scale}`,
      summary: item?.Text ?? `${labels[code]} activity is at NOAA scale ${code}${scale}.`,
      timestamp: Number.isFinite(date) ? date : retrievedAt,
      severity: Math.min(100, 18 + scale * 16),
      confidence: .97,
      entities: [{ id: 'organization-noaa-swpc', type: 'ORGANIZATION', name: 'NOAA Space Weather Prediction Center' }],
      attributes: { scaleFamily: code, scale, global: true },
      provenance: [{ label: 'OFFICIAL_SOURCE', description: 'Current NOAA Space Weather Scale observation.', sourceUrl: 'https://www.swpc.noaa.gov/' }],
      expiresAt: retrievedAt + 3 * 3600000,
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
