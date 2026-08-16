import { z } from 'zod'
import { validateSignal } from '../lib/signal'
import type { Signal } from '../types/signal'
import { fetchWithTimeout, providerHttpError, type SignalProvider, type SignalQueryContext } from './types'

const propertiesSchema = z.object({
  volcanoName: z.string().min(1).max(180),
  vnum: z.string().max(30),
  volcanoCd: z.string().max(30),
  volcanoUrl: z.string().url().optional().or(z.literal('')),
  volcanoImage: z.string().url().optional().or(z.literal('')),
  obs: z.string().max(20),
  region: z.string().max(120),
  noticeSynopsis: z.string().max(1600).nullable().optional(),
  noticeUrl: z.string().url().nullable().optional(),
  alertLevel: z.string().max(30),
  colorCode: z.string().max(30),
  alertDate: z.string().nullable().optional(),
  colorDate: z.string().nullable().optional(),
  nvewsThreat: z.string().max(80).nullable().optional(),
})

const collectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(z.object({
    type: z.literal('Feature'),
    geometry: z.object({ type: z.literal('Point'), coordinates: z.tuple([z.number(), z.number()]) }),
    properties: propertiesSchema,
  })).max(500),
})

const activeAlertLevels = new Set(['ADVISORY', 'WATCH', 'WARNING'])
const activeColorCodes = new Set(['YELLOW', 'ORANGE', 'RED'])
const levelSeverity: Record<string, number> = { ADVISORY: 55, WATCH: 78, WARNING: 96 }
const colorSeverity: Record<string, number> = { YELLOW: 52, ORANGE: 78, RED: 96 }

function parseUsgsDate(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Date.parse(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function normalizeVolcanoes(payload: unknown, retrievedAt = Date.now()): Signal[] {
  const collection = collectionSchema.parse(payload)
  return collection.features.flatMap((feature) => {
    const properties = feature.properties
    const alertLevel = properties.alertLevel.toUpperCase()
    const colorCode = properties.colorCode.toUpperCase()
    if (!activeAlertLevels.has(alertLevel) && !activeColorCodes.has(colorCode)) return []
    const [longitude, latitude] = feature.geometry.coordinates
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return []
    const sourceUrl = properties.noticeUrl || properties.volcanoUrl || undefined
    const observedAt = parseUsgsDate(properties.alertDate) ?? parseUsgsDate(properties.colorDate)
    const severity = Math.max(levelSeverity[alertLevel] ?? 0, colorSeverity[colorCode] ?? 0)
    return [validateSignal({
      id: `usgs-volcano-${properties.vnum || properties.volcanoCd}`,
      source: { provider: 'usgs-volcano', dataset: 'USGS Volcano Hazards Program status', url: sourceUrl, retrievedAt, freshness: 'live' },
      type: 'environment',
      title: `Volcano ${alertLevel === 'WARNING' ? 'Warning' : alertLevel === 'WATCH' ? 'Watch' : 'Advisory'} — ${properties.volcanoName}`,
      summary: properties.noticeSynopsis ?? `${properties.volcanoName} is currently ${colorCode}/${alertLevel} according to the responsible USGS volcano observatory.`,
      timestamp: retrievedAt,
      startTime: observedAt,
      location: { latitude, longitude },
      geometry: feature.geometry,
      severity,
      confidence: .98,
      entities: [
        { id: `volcano-${properties.vnum || properties.volcanoCd}`, type: 'FACILITY', name: properties.volcanoName },
        { id: `region-${properties.region.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, type: 'REGION', name: properties.region },
      ],
      attributes: {
        alertLevel, colorCode, observatory: properties.obs.toUpperCase(), region: properties.region,
        nvewsThreat: properties.nvewsThreat, volcanoImage: properties.volcanoImage || undefined, observedAt,
      },
      provenance: [{ label: 'OFFICIAL_SOURCE', description: 'Current alert level and aviation color code published by the USGS Volcano Hazards Program.', sourceUrl }],
      expiresAt: retrievedAt + 60 * 60000,
    })]
  })
}

export const volcanoProvider: SignalProvider = {
  id: 'usgs-volcano',
  name: 'USGS Volcanoes',
  description: 'Official elevated U.S. volcano alert levels and aviation color codes.',
  cadenceMs: 10 * 60000,
  dataClass: 'official',
  async isAvailable() { return navigator.onLine },
  async fetchSignals(context: SignalQueryContext) {
    const response = await fetchWithTimeout('https://volcanoes.usgs.gov/vsc/api/volcanoApi/geojson', { signal: context.signal }, 9000)
    if (!response.ok) throw providerHttpError(response, 'usgs-volcano')
    return normalizeVolcanoes(await response.json())
  },
}
