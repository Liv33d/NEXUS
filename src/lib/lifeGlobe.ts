import { cellToLatLng, latLngToCell } from 'h3-js'
import { z } from 'zod'
import { fetchWithTimeout, providerHttpError } from '../providers/types'
import type { TaxonMedia } from './gbifPresentation'

const CACHE_PREFIX = 'nexus:life-globe:v3'
const CACHE_TTL = 12 * 60 * 60 * 1000
export const LIFE_CACHE_MAX_AGE = 72 * 60 * 60 * 1000
const PAGE_SIZE = 300
const TAXA = [
  { key: '1', label: 'Animalia' },
  { key: '6', label: 'Plantae' },
] as const

const responseSchema = z.object({
  results: z.array(z.object({
    key: z.number(), speciesKey: z.number().optional(), species: z.string().max(300).optional(), scientificName: z.string().max(300).optional(),
    vernacularName: z.string().max(300).optional(), kingdom: z.string().max(100).optional(), class: z.string().max(150).optional(),
    decimalLatitude: z.number().min(-90).max(90), decimalLongitude: z.number().min(-180).max(180),
    coordinateUncertaintyInMeters: z.number().nonnegative().optional(), license: z.string().max(300).optional(),
  })).max(PAGE_SIZE),
})

type LifeRecord = z.infer<typeof responseSchema>['results'][number]

export interface LifeGlobeCell { id: string; latitude: number; longitude: number; observations: number }
export interface LifeGlobeTaxon {
  id: string
  taxonKey: number
  scientificName: string
  commonName?: string
  kingdom?: string
  taxonomicClass?: string
  observations: number
  latitude: number
  longitude: number
  sourceUrl: string
  media?: TaxonMedia
}
export interface LifeGlobeSnapshot {
  queryKey: string
  cells: LifeGlobeCell[]
  taxa: LifeGlobeTaxon[]
  recordCount: number
  retrievedAt: number
  freshness: 'live' | 'cached'
  methodology: string
}

export const MIN_LIFE_CELL_RECORDS = 10
export const MIN_LIFE_TAXON_RECORDS = 5

function publicDomainLicense(value?: string) {
  const license = value?.trim().toLowerCase().replace(/\/+$/, '') ?? ''
  return license === 'cc0_1_0' || license === 'cc0' || /^https?:\/\/creativecommons\.org\/publicdomain\/zero\/1\.0$/.test(license)
}

function usable(record: LifeRecord) {
  return Boolean(record.speciesKey && (record.species || record.scientificName)) && publicDomainLicense(record.license) && (record.coordinateUncertaintyInMeters ?? 0) <= 50_000
}

export function buildLifeGlobeSnapshot(input: LifeRecord[], now = Date.now(), queryKey = 'fixture'): LifeGlobeSnapshot {
  const records = input.filter(usable)
  const cellCounts = new Map<string, number>()
  const grouped = new Map<string, LifeRecord[]>()
  for (const record of records) {
    const cell = latLngToCell(record.decimalLatitude, record.decimalLongitude, 3)
    cellCounts.set(cell, (cellCounts.get(cell) ?? 0) + 1)
    // A taxon is scoped to the same coarse privacy cell used for rendering.
    // This prevents a cross-continent centroid from looking like an observed
    // location and gives every visible taxon a k-anonymous spatial basis.
    const groupKey = `${record.speciesKey!}:${cell}`
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), record])
  }
  const cells = [...cellCounts.entries()].map(([id, observations]) => {
    const [latitude, longitude] = cellToLatLng(id)
    return { id, latitude, longitude, observations }
  }).filter((cell) => cell.observations >= MIN_LIFE_CELL_RECORDS)
    .sort((a, b) => b.observations - a.observations).slice(0, 100)
  const taxa = [...grouped.entries()].filter(([, values]) => values.length >= MIN_LIFE_TAXON_RECORDS).map(([groupKey, values]) => {
    const [speciesKeyValue, cell] = groupKey.split(':')
    const speciesKey = Number(speciesKeyValue)
    const [latitude, longitude] = cellToLatLng(cell!)
    return {
      id: `gbif-life-${speciesKey}-${cell}`,
      taxonKey: speciesKey,
      scientificName: values[0]!.species ?? values[0]!.scientificName!,
      commonName: values.find((record) => record.vernacularName)?.vernacularName,
      kingdom: values[0]!.kingdom,
      taxonomicClass: values[0]!.class,
      observations: values.length,
      latitude,
      longitude,
      sourceUrl: `https://www.gbif.org/species/${speciesKey}`,
    }
  }).sort((a, b) => b.observations - a.observations).slice(0, 36)
  return {
    queryKey, cells, taxa, recordCount: records.length, retrievedAt: now, freshness: 'live',
    methodology: `A spatially bounded sample of recent CC0 animal and plant occurrence records in the visible region, aggregated to coarse H3 resolution 3 cells. Regional cells require at least ${MIN_LIFE_CELL_RECORDS} records and displayed taxa require at least ${MIN_LIFE_TAXON_RECORDS} records in the same coarse cell. CC BY occurrence aggregates remain excluded until dataset-level credits are preserved. Records show where observations were published; they do not measure abundance, define a range, or expose precise wildlife locations.`,
  }
}

function boundingPolygon(latitude: number, longitude: number, radiusKm: number): string {
  const latDelta = Math.min(28, radiusKm / 111)
  const lngDelta = Math.min(35, radiusKm / Math.max(15, 111 * Math.cos(latitude * Math.PI / 180)))
  const south = Math.max(-89.9, latitude - latDelta).toFixed(4)
  const north = Math.min(89.9, latitude + latDelta).toFixed(4)
  const west = Math.max(-179.9, longitude - lngDelta).toFixed(4)
  const east = Math.min(179.9, longitude + lngDelta).toFixed(4)
  return `POLYGON((${west} ${south},${east} ${south},${east} ${north},${west} ${north},${west} ${south}))`
}

async function fetchTaxon(taxonKey: string, latitude: number, longitude: number, radiusKm: number, signal?: AbortSignal): Promise<LifeRecord[]> {
  const year = new Date().getUTCFullYear()
  const params = new URLSearchParams({ taxonKey, geometry: boundingPolygon(latitude, longitude, radiusKm), hasCoordinate: 'true', hasGeospatialIssue: 'false', occurrenceStatus: 'PRESENT', year: `${year - 1},${year}`, limit: String(PAGE_SIZE) })
  params.append('license', 'CC0_1_0')
  const response = await fetchWithTimeout(`https://api.gbif.org/v1/occurrence/search?${params}`, { signal }, 12_000)
  if (!response.ok) throw providerHttpError(response, `gbif-life-${taxonKey}`)
  return responseSchema.parse(await response.json()).results
}

function validCachedSnapshot(value: unknown, queryKey: string): value is LifeGlobeSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<LifeGlobeSnapshot>
  return snapshot.queryKey === queryKey && Number.isFinite(snapshot.retrievedAt) && Array.isArray(snapshot.cells) && Array.isArray(snapshot.taxa)
    && snapshot.cells.every((cell) => typeof cell?.id === 'string' && Number.isFinite(cell.observations) && cell.observations >= MIN_LIFE_CELL_RECORDS)
    && snapshot.taxa.every((taxon) => typeof taxon?.id === 'string' && Number.isFinite(taxon.observations) && taxon.observations >= MIN_LIFE_TAXON_RECORDS && typeof taxon.sourceUrl === 'string' && taxon.sourceUrl.startsWith('https://www.gbif.org/species/'))
}

export function lifeGlobeCacheKey(latitude: number, longitude: number, radiusKm: number, year = new Date().getUTCFullYear()): string {
  const radiusBandKm = Math.max(50, Math.round(radiusKm / 50) * 50)
  const center = `${latitude.toFixed(2)},${longitude.toFixed(2)}`
  return `${CACHE_PREFIX}:${latLngToCell(latitude, longitude, 3)}:c${center}:r${radiusBandKm}:y${year - 1}-${year}:cc0-k10-k5`
}

export async function fetchLifeGlobeSnapshot(latitude: number, longitude: number, radiusKm: number, signal?: AbortSignal, force = false): Promise<LifeGlobeSnapshot> {
  const cacheKey = lifeGlobeCacheKey(latitude, longitude, radiusKm)
  let cached: LifeGlobeSnapshot | undefined
  try {
    localStorage.removeItem('nexus:life-globe:v2')
    const parsed: unknown = JSON.parse(localStorage.getItem(cacheKey) ?? 'null')
    if (validCachedSnapshot(parsed, cacheKey) && Date.now() - parsed.retrievedAt <= LIFE_CACHE_MAX_AGE) cached = parsed
    else if (parsed) localStorage.removeItem(cacheKey)
  } catch { /* optional storage */ }
  if (!force && cached && Date.now() - cached.retrievedAt < CACHE_TTL) return { ...cached, freshness: 'cached' }
  try {
    const records = (await Promise.all(TAXA.map((taxon) => fetchTaxon(taxon.key, latitude, longitude, radiusKm, signal)))).flat()
    const snapshot = buildLifeGlobeSnapshot(records, Date.now(), cacheKey)
    try { localStorage.setItem(cacheKey, JSON.stringify(snapshot)) } catch { /* optional storage */ }
    return snapshot
  } catch (error) {
    if (cached && Date.now() - cached.retrievedAt <= LIFE_CACHE_MAX_AGE) return { ...cached, freshness: 'cached' }
    throw error
  }
}

export function clearLifeGlobeCache() {
  try { for (let index = localStorage.length - 1; index >= 0; index -= 1) { const key = localStorage.key(index); if (key?.startsWith('nexus:life-globe:')) localStorage.removeItem(key) } } catch { /* optional storage */ }
}
