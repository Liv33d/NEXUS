import { z } from 'zod'
import { validateSignal } from '../lib/signal'
import { buildTemporal, lineage } from '../lib/temporal'
import type { Signal } from '../types/signal'
import { fetchWithTimeout, providerHttpError, type SignalProvider, type SignalQueryContext } from './types'

const declarationSchema = z.object({
  DisasterDeclarationsSummaries: z.array(z.object({
    disasterNumber: z.number(), state: z.string().min(2).max(2), declarationType: z.string().max(8), declarationDate: z.string(),
    incidentType: z.string().max(120), declarationTitle: z.string().max(500), incidentBeginDate: z.string().nullable().optional(), incidentEndDate: z.string().nullable().optional(),
    designatedArea: z.string().max(500), fipsStateCode: z.string().nullable().optional(), fipsCountyCode: z.string().nullable().optional(),
    ihProgramDeclared: z.boolean().optional(), iaProgramDeclared: z.boolean().optional(), paProgramDeclared: z.boolean().optional(), hmProgramDeclared: z.boolean().optional(),
    lastRefresh: z.string().nullable().optional(),
  })).max(1000),
})

const stateCenters: Record<string, [number, number]> = {
  AL:[32.81,-86.79],AK:[64.2,-152.3],AZ:[34.29,-111.66],AR:[34.9,-92.44],CA:[37.15,-119.68],CO:[38.99,-105.55],CT:[41.62,-72.73],DE:[38.99,-75.51],DC:[38.91,-77.04],FL:[28.45,-82.45],GA:[32.63,-83.42],HI:[20.26,-156.35],ID:[44.35,-114.61],IL:[40.04,-89.2],IN:[39.89,-86.28],IA:[42.08,-93.5],KS:[38.49,-98.38],KY:[37.53,-85.29],LA:[31.07,-91.99],ME:[45.37,-69.24],MD:[39.05,-76.64],MA:[42.26,-71.81],MI:[44.35,-85.41],MN:[46.28,-94.31],MS:[32.74,-89.67],MO:[38.35,-92.46],MT:[47.05,-109.63],NE:[41.54,-99.8],NV:[39.33,-116.63],NH:[43.68,-71.58],NJ:[40.11,-74.66],NM:[34.42,-106.11],NY:[42.95,-75.53],NC:[35.56,-79.39],ND:[47.45,-100.47],OH:[40.29,-82.79],OK:[35.59,-97.49],OR:[43.94,-120.56],PA:[40.88,-77.8],RI:[41.68,-71.51],SC:[33.92,-80.9],SD:[44.44,-100.23],TN:[35.84,-86.35],TX:[31.49,-99.35],UT:[39.31,-111.67],VT:[44.07,-72.67],VA:[37.52,-78.85],WA:[47.38,-120.45],WV:[38.64,-80.62],WI:[44.62,-89.85],WY:[43,-107.55],PR:[18.22,-66.48],VI:[18.34,-64.9],GU:[13.44,144.79],MP:[15.18,145.73],AS:[-14.27,-170.13],
}

type Declaration = z.infer<typeof declarationSchema>['DisasterDeclarationsSummaries'][number]
const parsed = (value?: string | null, fallback = Date.now()) => { const result = value ? Date.parse(value) : Number.NaN; return Number.isFinite(result) ? result : fallback }

function severity(type: string, declaration: string) {
  const hazard = /hurricane|typhoon|earthquake|tsunami/i.test(type) ? 78 : /fire|flood|tornado|severe storm/i.test(type) ? 66 : 52
  return Math.min(90, hazard + (declaration === 'DR' ? 8 : declaration === 'EM' ? 4 : 0))
}

export function normalizeOpenFema(payload: unknown, retrievedAt = Date.now()): Signal[] {
  const records = declarationSchema.parse(payload).DisasterDeclarationsSummaries
  const grouped = new Map<string, Declaration[]>()
  for (const record of records) {
    const key = `${record.disasterNumber}-${record.state}`
    grouped.set(key, [...(grouped.get(key) ?? []), record])
  }
  return [...grouped.entries()].flatMap(([key, values]) => {
    const first = values[0]!
    const center = stateCenters[first.state]
    if (!center) return []
    const timestamp = parsed(first.declarationDate, retrievedAt)
    const validFrom = parsed(first.incidentBeginDate, timestamp)
    const validUntil = first.incidentEndDate ? parsed(first.incidentEndDate) : undefined
    const updatedAt = first.lastRefresh ? parsed(first.lastRefresh, timestamp) : undefined
    const areas = [...new Set(values.map((record) => record.designatedArea).filter(Boolean))]
    const assistancePrograms = [
      values.some((record) => record.ihProgramDeclared) ? 'Individual and Households assistance' : undefined,
      values.some((record) => record.iaProgramDeclared) ? 'Individual assistance' : undefined,
      values.some((record) => record.paProgramDeclared) ? 'Public assistance' : undefined,
      values.some((record) => record.hmProgramDeclared) ? 'Hazard mitigation assistance' : undefined,
    ].filter((value): value is string => Boolean(value))
    const sourceUrl = `https://www.fema.gov/disaster/${first.disasterNumber}`
    const areaSummary = areas.length <= 2 ? areas.join(' and ') : `${areas.slice(0, 2).join(', ')} and ${areas.length - 2} other designated area${areas.length - 2 === 1 ? '' : 's'}`
    return [validateSignal({
      id: `openfema-${key}`,
      source: { provider: 'openfema', dataset: 'OpenFEMA Disaster Declarations Summaries v2', url: sourceUrl, retrievedAt, freshness: 'delayed', ...lineage('openfema-disasters', 'administrative', String(first.disasterNumber), first.lastRefresh ?? first.declarationDate) },
      type: 'environment',
      title: `${first.incidentType} declaration — ${first.state}`,
      summary: `A federal ${first.declarationType === 'DR' ? 'major disaster' : first.declarationType === 'EM' ? 'emergency' : 'fire management'} declaration covers ${areaSummary || first.state}.`,
      timestamp,
      startTime: validFrom,
      endTime: validUntil,
      temporal: buildTemporal({ issuedAt: timestamp, updatedAt, validFrom, validUntil, confirmedAt: retrievedAt, basis: 'publisher-issue' }),
      location: { latitude: center[0], longitude: center[1], accuracy: 500_000 },
      severity: severity(first.incidentType, first.declarationType), confidence: .99,
      entities: [{ id: `fema-disaster-${first.disasterNumber}`, type: 'EVENT', name: first.declarationTitle }, { id: `region-${first.state.toLowerCase()}`, type: 'REGION', name: first.state }],
      attributes: { signalKind: 'fema-disaster', disasterNumber: first.disasterNumber, declarationType: first.declarationType, declarationTitle: first.declarationTitle, incidentType: first.incidentType, designatedAreas: areas, assistancePrograms, fipsStateCode: first.fipsStateCode, lastRefresh: first.lastRefresh, mapPlacement: 'state-centroid' },
      provenance: [{ label: 'OFFICIAL_SOURCE', description: 'OpenFEMA Disaster Declarations Summaries. The map symbol is placed at the state or territory center because declarations list designated areas but do not include event coordinates.', sourceUrl }],
      expiresAt: retrievedAt + 90 * 86_400_000,
    })]
  })
}

export const openFemaProvider: SignalProvider = {
  id: 'openfema', name: 'FEMA Disasters', description: 'Recent U.S. federal disaster and emergency declarations with designated-area and assistance context.', cadenceMs: 60 * 60_000, dataClass: 'official',
  async isAvailable() { return navigator.onLine },
  async fetchSignals(context: SignalQueryContext) {
    const params = new URLSearchParams({ '$top': '500', '$orderby': 'declarationDate desc' })
    const response = await fetchWithTimeout(`https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?${params}`, { signal: context.signal }, 12_000)
    if (!response.ok) throw providerHttpError(response, 'openfema')
    const earliest = Math.max(context.since, context.until - 30 * 86_400_000)
    return normalizeOpenFema(await response.json()).filter((signal) => signal.timestamp >= earliest)
  },
}
