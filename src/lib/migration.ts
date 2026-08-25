import { cellToLatLng, latLngToCell } from 'h3-js'
import { z } from 'zod'
import { fetchWithTimeout, providerHttpError } from '../providers/types'
import { fetchGbifTaxonPresentation, type TaxonMedia } from './gbifPresentation'

const AVES_TAXON_KEY = '212'
const CACHE_KEY = 'nexus:migration:v3'
const CACHE_TTL = 6 * 60 * 60 * 1000
const MAX_RECORDS_PER_WINDOW = 300
const WINDOW_PAGES = 2

const occurrenceSchema = z.object({
  results: z.array(z.object({
    key: z.number(),
    speciesKey: z.number().optional(),
    species: z.string().max(260).optional(),
    scientificName: z.string().max(300).optional(),
    vernacularName: z.string().max(260).optional(),
    decimalLatitude: z.number().min(-90).max(90),
    decimalLongitude: z.number().min(-180).max(180),
    coordinateUncertaintyInMeters: z.number().nonnegative().optional(),
    eventDate: z.string().optional(),
    license: z.string().max(300).optional(),
  })).max(MAX_RECORDS_PER_WINDOW),
})

export interface MigrationActivityCell {
  id: string
  latitude: number
  longitude: number
  observations: number
}

export interface MigrationCorridor {
  id: string
  taxonKey: number
  species: string
  commonName?: string
  startLatitude: number
  startLongitude: number
  endLatitude: number
  endLongitude: number
  priorObservations: number
  recentObservations: number
  distanceKm: number
  direction: string
  confidence: number
  media?: TaxonMedia
}

export interface MigrationSpeciesSummary {
  id: string
  taxonKey: number
  species: string
  commonName?: string
  recentObservations: number
  priorObservations: number
  latitude: number
  longitude: number
}

export interface MigrationSnapshot {
  cells: MigrationActivityCell[]
  corridors: MigrationCorridor[]
  species: MigrationSpeciesSummary[]
  recentRecordCount: number
  priorRecordCount: number
  retrievedAt: number
  recentWindow: { start: number; end: number }
  priorWindow: { start: number; end: number }
  sourceUrl: string
  methodology: string
  freshness: 'live' | 'cached'
}

interface BirdRecord {
  key: number
  speciesKey?: number
  species?: string
  scientificName?: string
  vernacularName?: string
  decimalLatitude: number
  decimalLongitude: number
  coordinateUncertaintyInMeters?: number
  eventDate?: string
  license?: string
}

function isPublicDomainLicense(value?: string): boolean {
  const license = value?.toLowerCase() ?? ''
  return license.includes('publicdomain') || license.includes('/zero/') || license === 'cc0' || license === 'cc0_1_0'
}

function usable(record: BirdRecord): boolean {
  return isPublicDomainLicense(record.license) && (record.coordinateUncertaintyInMeters ?? 0) <= 50_000 &&
    Boolean(record.speciesKey && (record.species || record.scientificName))
}

function centroid(records: BirdRecord[]): { latitude: number; longitude: number } {
  let latitude = 0
  let sinLongitude = 0
  let cosLongitude = 0
  for (const record of records) {
    latitude += record.decimalLatitude
    const radians = record.decimalLongitude * Math.PI / 180
    sinLongitude += Math.sin(radians)
    cosLongitude += Math.cos(radians)
  }
  return {
    latitude: latitude / records.length,
    longitude: Math.atan2(sinLongitude / records.length, cosLongitude / records.length) * 180 / Math.PI,
  }
}

function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const radians = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * radians
  const dLon = (b.longitude - a.longitude) * radians
  const lat1 = a.latitude * radians
  const lat2 = b.latitude * radians
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function movementDirection(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): string {
  const radians = Math.PI / 180
  const dLon = (b.longitude - a.longitude) * radians
  const lat1 = a.latitude * radians
  const lat2 = b.latitude * radians
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  const bearing = (Math.atan2(y, x) / radians + 360) % 360
  return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(bearing / 45) % 8]!
}

export function buildMigrationSnapshot(recentInput: BirdRecord[], priorInput: BirdRecord[], now = Date.now()): MigrationSnapshot {
  const recent = recentInput.filter(usable)
  const prior = priorInput.filter(usable)
  const cellCounts = new Map<string, number>()
  for (const record of recent) {
    // Resolution 3 is deliberately coarse (~12,000 km²) to avoid exposing
    // sensitive wildlife locations or implying precision the source may lack.
    const cell = latLngToCell(record.decimalLatitude, record.decimalLongitude, 3)
    cellCounts.set(cell, (cellCounts.get(cell) ?? 0) + 1)
  }
  const cells = [...cellCounts.entries()].map(([id, observations]) => {
    const [latitude, longitude] = cellToLatLng(id)
    return { id, latitude, longitude, observations }
  }).sort((a, b) => b.observations - a.observations).slice(0, 90)

  const group = (records: BirdRecord[]) => {
    const grouped = new Map<number, BirdRecord[]>()
    for (const record of records) grouped.set(record.speciesKey!, [...(grouped.get(record.speciesKey!) ?? []), record])
    return grouped
  }
  const recentSpecies = group(recent)
  const priorSpecies = group(prior)
  const species: MigrationSpeciesSummary[] = [...recentSpecies.entries()].map(([speciesKey, current]) => {
    const previous = priorSpecies.get(speciesKey) ?? []
    const location = centroid(current)
    return {
      id: `gbif-bird-${speciesKey}`,
      taxonKey: speciesKey,
      species: current[0]!.species ?? current[0]!.scientificName!,
      commonName: current.find((record) => record.vernacularName)?.vernacularName,
      recentObservations: current.length,
      priorObservations: previous.length,
      latitude: location.latitude,
      longitude: location.longitude,
    }
  }).sort((a, b) => b.recentObservations - a.recentObservations || b.priorObservations - a.priorObservations).slice(0, 32)
  const corridors: MigrationCorridor[] = []
  for (const [speciesKey, current] of recentSpecies) {
    const previous = priorSpecies.get(speciesKey)
    if (!previous || current.length < 3 || previous.length < 3) continue
    const start = centroid(previous)
    const end = centroid(current)
    const distance = distanceKm(start, end)
    if (distance < 120 || distance > 5_000) continue
    corridors.push({
      id: `gbif-shift-${speciesKey}`,
      taxonKey: speciesKey,
      species: current[0]!.species ?? current[0]!.scientificName!,
      commonName: current.find((record) => record.vernacularName)?.vernacularName,
      startLatitude: start.latitude,
      startLongitude: start.longitude,
      endLatitude: end.latitude,
      endLongitude: end.longitude,
      priorObservations: previous.length,
      recentObservations: current.length,
      distanceKm: Math.round(distance),
      direction: movementDirection(start, end),
      confidence: Math.min(0.82, 0.35 + Math.min(current.length, previous.length) / 30),
    })
  }
  corridors.sort((a, b) => (b.recentObservations + b.priorObservations) - (a.recentObservations + a.priorObservations))
  const day = 86_400_000
  return {
    cells,
    corridors: corridors.slice(0, 24),
    species,
    recentRecordCount: recent.length,
    priorRecordCount: prior.length,
    retrievedAt: now,
    recentWindow: { start: now - 14 * day, end: now },
    priorWindow: { start: now - 28 * day, end: now - 14 * day },
    sourceUrl: 'https://www.gbif.org/occurrence/search?taxon_key=212',
    methodology: 'Recent CC0 bird occurrence records are aggregated to coarse H3 cells. CC BY occurrence aggregates remain excluded until dataset-level credits are preserved. Animated corridors show changes in species observation centroids between two 14-day samples; they are derived sampling signals, not forecasts, abundance estimates, or tracks of individual birds.',
    freshness: 'live',
  }
}

function dateOnly(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

async function fetchWindowPage(start: number, end: number, offset: number, signal?: AbortSignal): Promise<BirdRecord[]> {
  const params = new URLSearchParams({
    taxonKey: AVES_TAXON_KEY,
    hasCoordinate: 'true',
    hasGeospatialIssue: 'false',
    occurrenceStatus: 'PRESENT',
    eventDate: `${dateOnly(start)},${dateOnly(end)}`,
    limit: String(MAX_RECORDS_PER_WINDOW),
    offset: String(offset),
  })
  // Filter server-side so a page dominated by noncommercial records does not
  // collapse the visualization after local license governance is applied.
  params.append('license', 'CC0_1_0')
  const response = await fetchWithTimeout(`https://api.gbif.org/v1/occurrence/search?${params}`, { signal }, 12_000)
  if (!response.ok) throw providerHttpError(response, 'gbif-migration')
  return occurrenceSchema.parse(await response.json()).results
}

async function fetchWindow(start: number, end: number, signal?: AbortSignal): Promise<BirdRecord[]> {
  const pages = await Promise.all(Array.from({ length: WINDOW_PAGES }, (_, index) => fetchWindowPage(start, end, index * MAX_RECORDS_PER_WINDOW, signal)))
  return pages.flat()
}

export async function fetchMigrationSnapshot(signal?: AbortSignal, force = false): Promise<MigrationSnapshot> {
  let cached: MigrationSnapshot | null = null
  if (!force) {
    try {
      cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as MigrationSnapshot | null
      if (cached && Date.now() - cached.retrievedAt < CACHE_TTL) return { ...cached, freshness: 'cached' }
    } catch { /* storage is optional */ }
  }
  const now = Date.now()
  const day = 86_400_000
  let recent: BirdRecord[]
  let prior: BirdRecord[]
  try {
    [recent, prior] = await Promise.all([
      fetchWindow(now - 14 * day, now, signal),
      fetchWindow(now - 28 * day, now - 14 * day, signal),
    ])
  } catch (error) {
    if (cached) return { ...cached, freshness: 'cached' }
    throw error
  }
  const base = buildMigrationSnapshot(recent, prior, now)
  const enriched = await Promise.all(base.corridors.slice(0, 8).map(async (corridor) => {
    const presentation = await fetchGbifTaxonPresentation(corridor.taxonKey, `https://www.gbif.org/species/${corridor.taxonKey}`, signal)
    return { ...corridor, commonName: presentation.commonName ?? corridor.commonName, media: presentation.media }
  }))
  const snapshot = { ...base, corridors: [...enriched, ...base.corridors.slice(8)] }
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot)) } catch { /* storage is optional */ }
  return snapshot
}
