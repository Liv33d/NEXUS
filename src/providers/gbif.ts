import { z } from 'zod'
import { fetchWithTimeout, providerHttpError } from './types'
import { fetchGbifTaxonPresentation, type TaxonMedia } from '../lib/gbifPresentation'

const occurrenceSchema = z.object({
  count: z.number().optional(),
  results: z.array(z.object({
    key: z.number(), speciesKey: z.number().optional(), scientificName: z.string().max(300).optional(), species: z.string().max(300).optional(), vernacularName: z.string().max(300).optional(),
    kingdom: z.string().max(100).optional(), class: z.string().max(150).optional(), order: z.string().max(150).optional(), family: z.string().max(150).optional(),
    eventDate: z.string().optional(), basisOfRecord: z.string().max(80).optional(), datasetKey: z.string().optional(), datasetTitle: z.string().max(500).optional(),
    license: z.string().max(300).optional(), issues: z.array(z.string()).optional(), coordinateUncertaintyInMeters: z.number().optional(),
  })).max(300),
})

export interface LifeTaxonSummary {
  id: string
  taxonKey?: number
  scientificName: string
  commonName?: string
  kingdom?: string
  taxonomicClass?: string
  count: number
  latestObservation?: number
  license: 'CC0' | 'CC BY'
  occurrenceUrl: string
  datasetTitle?: string
  basisOfRecord?: string
  media?: TaxonMedia
}

export interface LifeContext {
  radiusKm: number
  sampledRecords: number
  totalMatchingRecords: number
  taxa: LifeTaxonSummary[]
  retrievedAt: number
  sourceUrl: string
  methodology: string
}

const lifeCache = new Map<string, LifeContext>()

function publicDomainLicense(value?: string): LifeTaxonSummary['license'] | undefined {
  const license = value?.toLowerCase() ?? ''
  if (license.includes('publicdomain') || license.includes('/zero/') || license === 'cc0') return 'CC0'
  return undefined
}

function boundingPolygon(latitude: number, longitude: number, radiusKm: number): string {
  const latDelta = radiusKm / 111
  const lngDelta = Math.min(25, radiusKm / Math.max(15, 111 * Math.cos(latitude * Math.PI / 180)))
  const south = Math.max(-89.9, latitude - latDelta).toFixed(5)
  const north = Math.min(89.9, latitude + latDelta).toFixed(5)
  const west = Math.max(-179.9, longitude - lngDelta).toFixed(5)
  const east = Math.min(179.9, longitude + lngDelta).toFixed(5)
  return `POLYGON((${west} ${south},${east} ${south},${east} ${north},${west} ${north},${west} ${south}))`
}

export async function fetchLifeContext(latitude: number, longitude: number, signal?: AbortSignal, radiusKm = 75): Promise<LifeContext> {
  const now = Date.now()
  const cacheKey = `${latitude.toFixed(2)}:${longitude.toFixed(2)}:${radiusKm}`
  const cached = lifeCache.get(cacheKey)
  if (cached && now - cached.retrievedAt < 6 * 3600000) return cached
  const params = new URLSearchParams({
    geometry: boundingPolygon(latitude, longitude, radiusKm), hasCoordinate: 'true', hasGeospatialIssue: 'false', occurrenceStatus: 'PRESENT',
    limit: '120', year: `${new Date().getUTCFullYear() - 5},${new Date().getUTCFullYear()}`,
  })
  const sourceUrl = `https://api.gbif.org/v1/occurrence/search?${params}`
  const response = await fetchWithTimeout(sourceUrl, { signal }, 10_000)
  if (!response.ok) throw providerHttpError(response, 'gbif')
  const payload = occurrenceSchema.parse(await response.json())
  const taxa = new Map<string, LifeTaxonSummary>()
  for (const record of payload.results) {
    const license = publicDomainLicense(record.license)
    const scientificName = record.species ?? record.scientificName
    if (!license || !scientificName || (record.coordinateUncertaintyInMeters ?? 0) > 50_000) continue
    const key = scientificName.toLocaleLowerCase()
    const observedAt = record.eventDate ? Date.parse(record.eventDate) : Number.NaN
    const prior = taxa.get(key)
    taxa.set(key, prior ? { ...prior, count: prior.count + 1, latestObservation: Number.isFinite(observedAt) ? Math.max(prior.latestObservation ?? 0, observedAt) : prior.latestObservation } : {
      id: `gbif-taxon-${key.replace(/[^a-z0-9]+/g, '-')}`,
      taxonKey: record.speciesKey,
      scientificName, commonName: record.vernacularName, kingdom: record.kingdom, taxonomicClass: record.class,
      count: 1, latestObservation: Number.isFinite(observedAt) ? observedAt : undefined, license,
      occurrenceUrl: `https://www.gbif.org/occurrence/${record.key}`, datasetTitle: record.datasetTitle, basisOfRecord: record.basisOfRecord,
    })
  }
  const ranked = [...taxa.values()].sort((a, b) => b.count - a.count || (b.latestObservation ?? 0) - (a.latestObservation ?? 0)).slice(0, 10)
  const enriched = await Promise.all(ranked.slice(0, 6).map(async (taxon) => {
    if (!taxon.taxonKey) return taxon
    const presentation = await fetchGbifTaxonPresentation(taxon.taxonKey, taxon.occurrenceUrl, signal)
    return { ...taxon, commonName: presentation.commonName ?? taxon.commonName, media: presentation.media }
  }))
  const context = {
    radiusKm, sampledRecords: payload.results.length, totalMatchingRecords: payload.count ?? payload.results.length,
    taxa: [...enriched, ...ranked.slice(6)],
    retrievedAt: now, sourceUrl,
    methodology: 'A bounded sample of recent georeferenced GBIF occurrences. Only CC0 records with acceptable coordinate uncertainty are summarized; CC BY aggregates remain excluded until dataset-level credits are preserved. Counts describe records, not abundance or population.',
  }
  lifeCache.set(cacheKey, context)
  return context
}
