import { cellToLatLng, latLngToCell } from 'h3-js'
import { z } from 'zod'
import { fetchWithTimeout, providerHttpError } from '../providers/types'

const CACHE_KEY = 'nexus:life-globe:v1'
const CACHE_TTL = 12 * 60 * 60 * 1000
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
  scientificName: string
  commonName?: string
  kingdom?: string
  taxonomicClass?: string
  observations: number
  latitude: number
  longitude: number
  sourceUrl: string
}
export interface LifeGlobeSnapshot {
  cells: LifeGlobeCell[]
  taxa: LifeGlobeTaxon[]
  recordCount: number
  retrievedAt: number
  freshness: 'live' | 'cached'
  methodology: string
}

function permissiveLicense(value?: string) {
  const license = value?.toLowerCase() ?? ''
  return license.includes('creativecommons.org/publicdomain/zero') || license.includes('creativecommons.org/licenses/by/4.0') || license === 'cc0_1_0' || license === 'cc_by_4_0'
}

function usable(record: LifeRecord) {
  return Boolean(record.speciesKey && (record.species || record.scientificName)) && permissiveLicense(record.license) && (record.coordinateUncertaintyInMeters ?? 0) <= 50_000
}

function centroid(records: LifeRecord[]) {
  let latitude = 0
  let sinLongitude = 0
  let cosLongitude = 0
  for (const record of records) {
    latitude += record.decimalLatitude
    const radians = record.decimalLongitude * Math.PI / 180
    sinLongitude += Math.sin(radians)
    cosLongitude += Math.cos(radians)
  }
  return { latitude: latitude / records.length, longitude: Math.atan2(sinLongitude, cosLongitude) * 180 / Math.PI }
}

export function buildLifeGlobeSnapshot(input: LifeRecord[], now = Date.now()): LifeGlobeSnapshot {
  const records = input.filter(usable)
  const cellCounts = new Map<string, number>()
  const grouped = new Map<number, LifeRecord[]>()
  for (const record of records) {
    const cell = latLngToCell(record.decimalLatitude, record.decimalLongitude, 3)
    cellCounts.set(cell, (cellCounts.get(cell) ?? 0) + 1)
    grouped.set(record.speciesKey!, [...(grouped.get(record.speciesKey!) ?? []), record])
  }
  const cells = [...cellCounts.entries()].map(([id, observations]) => {
    const [latitude, longitude] = cellToLatLng(id)
    return { id, latitude, longitude, observations }
  }).sort((a, b) => b.observations - a.observations).slice(0, 100)
  const taxa = [...grouped.entries()].map(([speciesKey, values]) => {
    const location = centroid(values)
    return {
      id: `gbif-life-${speciesKey}`,
      scientificName: values[0]!.species ?? values[0]!.scientificName!,
      commonName: values.find((record) => record.vernacularName)?.vernacularName,
      kingdom: values[0]!.kingdom,
      taxonomicClass: values[0]!.class,
      observations: values.length,
      latitude: location.latitude,
      longitude: location.longitude,
      sourceUrl: `https://www.gbif.org/species/${speciesKey}`,
    }
  }).sort((a, b) => b.observations - a.observations).slice(0, 36)
  return {
    cells, taxa, recordCount: records.length, retrievedAt: now, freshness: 'live',
    methodology: 'A bounded global sample of recent CC0 and CC BY animal and plant occurrences, aggregated to coarse H3 cells. Records show where observations were published; they do not measure abundance or expose precise wildlife locations.',
  }
}

async function fetchTaxon(taxonKey: string, signal?: AbortSignal): Promise<LifeRecord[]> {
  const year = new Date().getUTCFullYear()
  const params = new URLSearchParams({ taxonKey, hasCoordinate: 'true', hasGeospatialIssue: 'false', occurrenceStatus: 'PRESENT', year: `${year - 1},${year}`, limit: String(PAGE_SIZE) })
  params.append('license', 'CC0_1_0')
  params.append('license', 'CC_BY_4_0')
  const response = await fetchWithTimeout(`https://api.gbif.org/v1/occurrence/search?${params}`, { signal }, 12_000)
  if (!response.ok) throw providerHttpError(response, `gbif-life-${taxonKey}`)
  return responseSchema.parse(await response.json()).results
}

export async function fetchLifeGlobeSnapshot(signal?: AbortSignal, force = false): Promise<LifeGlobeSnapshot> {
  let cached: LifeGlobeSnapshot | undefined
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as LifeGlobeSnapshot | undefined } catch { /* optional storage */ }
  if (!force && cached && Date.now() - cached.retrievedAt < CACHE_TTL) return { ...cached, freshness: 'cached' }
  try {
    const records = (await Promise.all(TAXA.map((taxon) => fetchTaxon(taxon.key, signal)))).flat()
    const snapshot = buildLifeGlobeSnapshot(records)
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot)) } catch { /* optional storage */ }
    return snapshot
  } catch (error) {
    if (cached) return { ...cached, freshness: 'cached' }
    throw error
  }
}
