import { GLOBE_CITIES, type GlobeCity } from '../data/cities'
import type { LifeGlobeCell, LifeGlobeTaxon } from './lifeGlobe'
import type { MigrationActivityCell, MigrationCorridor } from './migration'
import { buildSignalContext } from './context'
import type { NexusIntelligenceObject } from '../types/intelligence'
import type { Signal } from '../types/signal'
import type { Discovery } from '../types/signal'
import type { LifeContext, LifeTaxonSummary } from '../providers/gbif'
import type { OrbitalPass } from './orbits'
import type { ObserverPlace } from '../providers/openMeteo'
import { fetchWithTimeout } from '../providers/types'

const radians = Math.PI / 180

function distanceKm(a: { latitude: number; longitude: number }, b: { lat: number; lng: number }) {
  const dLat = (b.lat - a.latitude) * radians
  const dLon = (b.lng - a.longitude) * radians
  const lat1 = a.latitude * radians
  const lat2 = b.lat * radians
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function nearestNamedPlace(location: { latitude: number; longitude: number }): { city: GlobeCity; distanceKm: number } | undefined {
  let best: { city: GlobeCity; distanceKm: number } | undefined
  for (const city of GLOBE_CITIES) {
    const distance = distanceKm(location, city)
    if (!best || distance < best.distanceKm) best = { city, distanceKm: distance }
  }
  return best
}

function broadPlace(location: { latitude: number; longitude: number }) {
  const nearest = nearestNamedPlace(location)
  if (!nearest) return `${location.latitude.toFixed(1)}°, ${location.longitude.toFixed(1)}°`
  return nearest.distanceKm <= 350 ? `near ${nearest.city.name}, ${nearest.city.country}` : `${Math.round(nearest.distanceKm)} km from ${nearest.city.name}, ${nearest.city.country}`
}

function signalDomain(signal: Signal): NexusIntelligenceObject['domain'] {
  if (signal.type === 'weather') return 'weather'
  if (signal.type === 'aircraft' || signal.type === 'infrastructure' || signal.type === 'media') return 'human'
  if (signal.type === 'satellite' || signal.type === 'space-weather') return 'orbit'
  if (signal.type === 'environment' && /ocean|marine|wave|buoy/i.test(`${signal.title} ${signal.source.dataset ?? ''}`)) return 'ocean'
  return 'hazards'
}

function signalMedia(_signal: Signal): NexusIntelligenceObject['media'] {
  // A provider page or global composite is not evidence about a selected
  // object. V2 only shows media whose footprint, frame time, creator, and
  // license can be attached to the entity. USGS event products are resolved
  // lazily below; other signals use an honest domain fallback meanwhile.
  void _signal
  return []
}

function sourceStatus(signal: Signal): NexusIntelligenceObject['status'] {
  if (signal.source.freshness === 'cached' || signal.source.freshness === 'demo') return 'cached'
  if (signal.source.provider === 'nhc' || signal.attributes.forecastTrack) return 'forecast'
  const age = Date.now() - signal.timestamp
  return age < 15 * 60_000 ? 'near-real-time' : 'recent'
}

type ThermalClassification = 'unclassified' | 'persistent' | 'possible-fire' | 'possible-volcanic'

export function classifyThermalSignal(signal: Signal, evidence: Signal[]): { classification: ThermalClassification; related: Signal[] } {
  if (signal.type !== 'fire' || signal.source.provider !== 'firms' || !signal.location) return { classification: 'unclassified', related: [] }
  const nearby = evidence.filter((candidate) => candidate.id !== signal.id && candidate.location && Math.abs(candidate.timestamp - signal.timestamp) <= 24 * 3_600_000 && distanceKm(signal.location!, { lat: candidate.location!.latitude, lng: candidate.location!.longitude }) <= 10)
  const corroboratingFire = nearby.find((candidate) => candidate.type === 'fire' && ['eonet', 'gdacs'].includes(candidate.source.provider) && /fire|wildfire|bushfire/i.test(`${candidate.title} ${candidate.source.dataset ?? ''}`))
  if (corroboratingFire) return { classification: 'possible-fire', related: [corroboratingFire] }
  const volcano = nearby.find((candidate) => candidate.source.provider === 'usgs-volcano')
  if (volcano) return { classification: 'possible-volcanic', related: [volcano] }
  const repeated = nearby.filter((candidate) => candidate.type === 'fire' && candidate.source.provider === 'firms' && Math.abs(candidate.timestamp - signal.timestamp) <= 36 * 3_600_000)
  const distinctIntervals = new Set([signal, ...repeated].map((item) => Math.floor(item.timestamp / (30 * 60_000))))
  if (distinctIntervals.size >= 2 && repeated.length >= 2) return { classification: 'persistent', related: repeated.slice(0, 3) }
  return { classification: 'unclassified', related: [] }
}

export function signalToIntelligence(signal: Signal, evidence: Signal[] = []): NexusIntelligenceObject {
  const context = buildSignalContext(signal)
  const thermal = classifyThermalSignal(signal, evidence)
  const title = thermal.classification === 'possible-fire' ? 'Possible fire activity'
    : thermal.classification === 'possible-volcanic' ? 'Possible volcanic thermal activity'
    : thermal.classification === 'persistent' ? 'Persistent thermal activity'
    : signal.source.provider === 'usgs-volcano'
    ? signal.entities?.find((entity) => entity.type === 'FACILITY')?.name ?? context.headline
    : context.headline
  const subtitle = signal.source.provider === 'usgs-volcano'
    ? `${String(signal.attributes.alertLevel ?? 'ACTIVE')} VOLCANO · ${String(signal.attributes.region ?? '')}`
    : signal.source.dataset ?? signal.source.provider
  return {
    id: signal.id, kind: 'signal', domain: signalDomain(signal), title, subtitle, status: sourceStatus(signal), evidence: thermal.classification === 'unclassified' ? context.confidence : 'possible',
    timestamp: signal.timestamp, location: signal.location, geometry: signal.geometry, media: signalMedia(signal),
    summary: thermal.classification === 'possible-fire' ? 'This satellite heat detection is near a separately reported fire event. The proximity provides context, but it does not prove that both observations represent the same incident.'
      : thermal.classification === 'possible-volcanic' ? 'This heat detection is near independently reported volcanic activity. The overlap is suggestive, not proof that the volcano caused this pixel.'
      : thermal.classification === 'persistent' ? 'Multiple thermal detections occurred across separate time intervals in this area. Persistence strengthens the observation while the underlying source remains unclassified.'
      : context.plainLanguageSummary,
    whyItMatters: context.whyItMatters, whatMayHappenNext: context.whatHappensNext,
    facts: context.technicalFacts, relationships: thermal.related.map((related) => { const object = signalToIntelligence(related); return { id: related.id, title: object.title, description: `${related.source.provider.toUpperCase()} · independent nearby evidence`, object } }), provenance: signal.provenance, methodology: thermal.classification === 'unclassified' ? context.methodology : `${context.methodology} NEXUS compared this detection with bounded nearby evidence in place and time; proximity does not prove causation.`,
    sourceUrl: signal.source.url, sourceSignal: signal,
    watchLabel: signal.source.provider === 'nhc' ? 'Watch storm' : signal.source.provider === 'usgs-volcano' ? 'Watch volcano' : `Watch ${signal.type.replace('-', ' ')}`,
  }
}

export function migrationToIntelligence(corridor: MigrationCorridor, retrievedAt: number, sourceUrl: string, methodology: string): NexusIntelligenceObject {
  const start = broadPlace({ latitude: corridor.startLatitude, longitude: corridor.startLongitude })
  const end = broadPlace({ latitude: corridor.endLatitude, longitude: corridor.endLongitude })
  const commonName = corridor.commonName ?? corridor.species
  return {
    id: corridor.id, kind: 'migration', domain: 'life', title: commonName, scientificName: corridor.commonName ? corridor.species : undefined,
    subtitle: `OBSERVATION SHIFT · ${corridor.direction.toUpperCase()}`, status: 'derived', evidence: 'derived', timestamp: retrievedAt,
    location: { latitude: corridor.endLatitude, longitude: corridor.endLongitude },
    geometry: { type: 'LineString', coordinates: [[corridor.startLongitude, corridor.startLatitude], [corridor.endLongitude, corridor.endLatitude]] },
    media: corridor.media ? [{ id: `${corridor.id}-photo`, kind: 'photo', url: corridor.media.url, title: commonName, alt: `Representative photograph of ${commonName}`, creator: corridor.media.creator, license: corridor.media.license, attribution: `${corridor.media.creator} · ${corridor.media.license}`, sourceUrl: corridor.media.sourceUrl, freshness: 'historical' }] : [],
    summary: `Recent ${commonName} observations are centered farther ${corridor.direction} than in the previous sampling period. This may be consistent with seasonal movement, but it is not an individual migration track.`,
    whyItMatters: 'This is a change in where observations were published—not a track of individual birds. It can reveal broad seasonal movement while protecting precise wildlife locations.',
    whatMayHappenNext: 'Later observation windows may confirm whether this pattern continues. Typical wintering and breeding ranges require separate species-range evidence and are not inferred from these points.',
    movement: { from: start, toward: end, direction: corridor.direction, distanceKm: corridor.distanceKm, interpretation: 'Derived comparison of coarse observation centers over two consecutive 14-day windows.' },
    facts: [{ label: 'Recent observations', value: corridor.recentObservations.toLocaleString() }, { label: 'Previous observations', value: corridor.priorObservations.toLocaleString() }, { label: 'Derived center shift', value: `${corridor.distanceKm.toLocaleString()} km ${corridor.direction}` }],
    relationships: [], provenance: [{ label: 'OPEN_DATA', description: 'Permissively licensed GBIF occurrence records.' }, { label: 'DERIVED_METRIC', description: 'NEXUS compares coarse observation centers; it does not infer individual routes.' }],
    methodology, sourceUrl, watchLabel: 'Watch observation changes',
  }
}

export function lifeTaxonToIntelligence(taxon: LifeGlobeTaxon, retrievedAt: number, methodology: string): NexusIntelligenceObject {
  const commonName = taxon.commonName ?? taxon.scientificName
  return {
    id: taxon.id, kind: 'species', domain: 'life', title: commonName, scientificName: taxon.commonName ? taxon.scientificName : undefined,
    subtitle: `${taxon.taxonomicClass ?? taxon.kingdom ?? 'LIFE'} · RECENTLY OBSERVED`, status: 'recent', evidence: 'observed', timestamp: retrievedAt,
    location: { latitude: taxon.latitude, longitude: taxon.longitude },
    media: taxon.media ? [{ id: `${taxon.id}-photo`, kind: 'photo', url: taxon.media.url, title: commonName, alt: `Representative photograph of ${commonName}`, creator: taxon.media.creator, license: taxon.media.license, attribution: `${taxon.media.creator} · ${taxon.media.license}`, sourceUrl: taxon.media.sourceUrl, freshness: 'historical' }] : [],
    summary: `${taxon.observations.toLocaleString()} permissively licensed recent observation${taxon.observations === 1 ? '' : 's'} in the current bounded global sample.`,
    whyItMatters: 'These records document published observations, not the total abundance or exact range of this species.',
    facts: [{ label: 'Recent sampled records', value: taxon.observations.toLocaleString() }, { label: 'Group', value: taxon.taxonomicClass ?? taxon.kingdom ?? 'Unspecified' }],
    relationships: [], provenance: [{ label: 'OPEN_DATA', description: 'GBIF occurrence and species services; only CC0 and CC BY records are used.' }],
    methodology, sourceUrl: taxon.sourceUrl, watchLabel: 'Watch species',
  }
}

export function ecologicalClusterToIntelligence(cell: LifeGlobeCell | MigrationActivityCell, domain: 'life' | 'migration', retrievedAt: number, methodology: string): NexusIntelligenceObject {
  return {
    id: `${domain}-cluster-${cell.id}`, kind: 'life-cluster', domain: 'life', title: `${cell.observations.toLocaleString()} ${domain === 'migration' ? 'bird' : 'life'} observations`,
    subtitle: domain === 'migration' ? 'BIRD OBSERVATION AREA' : 'BIODIVERSITY ACTIVITY AREA', status: domain === 'migration' ? 'derived' : 'recent', evidence: domain === 'migration' ? 'derived' : 'observed', timestamp: retrievedAt,
    location: { latitude: cell.latitude, longitude: cell.longitude }, media: [],
    summary: `A coarse regional cell contains ${cell.observations.toLocaleString()} recent published observation${cell.observations === 1 ? '' : 's'}.`,
    whyItMatters: 'NEXUS aggregates records at this scale to show patterns without exposing sensitive wildlife coordinates.',
    facts: [{ label: 'Observations', value: cell.observations.toLocaleString() }, { label: 'H3 cell', value: cell.id }], relationships: [],
    provenance: [{ label: 'DERIVED_METRIC', description: 'Coarse H3 aggregation of permissively licensed GBIF occurrence records.' }], methodology, watchLabel: `Watch this ${domain === 'migration' ? 'migration area' : 'area'}`,
  }
}

export function signalClusterToIntelligence(signals: Signal[], location: { latitude: number; longitude: number }): NexusIntelligenceObject {
  const ranked = [...signals].sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0) || b.timestamp - a.timestamp)
  const domains = new Set(ranked.map(signalDomain))
  const primary = ranked[0]
  const newest = ranked.length ? Math.max(...ranked.map((signal) => signal.timestamp)) : Date.now()
  return {
    id: `signal-cluster-${location.latitude.toFixed(3)}-${location.longitude.toFixed(3)}`,
    kind: 'signal-cluster', domain: primary && domains.size === 1 ? signalDomain(primary) : 'place',
    title: `${ranked.length} signals here`, subtitle: 'LOCAL ACTIVITY CLUSTER', status: 'recent', timestamp: newest,
    location, media: [],
    summary: `NEXUS grouped ${ranked.length} nearby signals to keep the map readable. The most significant items are listed below.`,
    whyItMatters: 'A cluster is a visual summary, not a single event. Select an item to inspect its evidence, context, and source.',
    facts: [{ label: 'Signals', value: ranked.length.toLocaleString() }, { label: 'Data domains', value: domains.size.toLocaleString() }],
    relationships: ranked.slice(0, 6).map((signal) => {
      const object = signalToIntelligence(signal)
      return { id: signal.id, title: object.title, description: `${signal.type.replace('-', ' ')} · ${relativeSignalAge(signal.timestamp)}`, object }
    }),
    provenance: [{ label: 'DERIVED_METRIC', description: 'MapLibre spatial cluster of normalized NEXUS Signals at the current zoom.' }],
    methodology: 'Nearby on-screen Signal points are grouped for legibility. Opening a related item reveals its original provider and full methodology.',
    watchLabel: 'Watch this area',
  }
}

export function discoveryToIntelligence(discovery: Discovery, signals: Signal[]): NexusIntelligenceObject {
  const members = signals.filter((signal) => discovery.signalIds.includes(signal.id))
  const ranked = [...members].sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0) || b.timestamp - a.timestamp)
  const memory = discovery.memory
  const baseline = memory?.status === 'established' && memory.deviationPercent !== undefined
    ? `${memory.deviationPercent >= 0 ? '+' : ''}${memory.deviationPercent}% compared with the ${memory.observedDays}-day regional baseline.`
    : 'NEXUS is still learning the regional baseline.'
  return {
    id: discovery.id, kind: 'phenomenon', domain: ranked[0] ? signalDomain(ranked[0]) : 'place',
    title: discovery.title, subtitle: `${discovery.level.toUpperCase()} ACTIVITY · ${ranked.length} EVIDENCE ITEMS`,
    status: 'derived', timestamp: discovery.createdAt, location: discovery.center, media: ranked.flatMap((signal) => signalMedia(signal)).slice(0, 4),
    summary: discovery.description, whyItMatters: `This grouping crossed NEXUS's explainable activity threshold. ${baseline}`,
    whatMayHappenNext: 'NEXUS will update this phenomenon as new evidence arrives. Correlation describes proximity in place and time; it does not prove causation.',
    facts: [
      { label: 'Priority score', value: `${discovery.score} / 100` },
      { label: 'Evidence', value: ranked.length.toLocaleString() },
      { label: 'Independent sources', value: new Set(ranked.map((signal) => signal.source.provider)).size.toLocaleString() },
    ],
    relationships: ranked.slice(0, 6).map((signal) => { const object = signalToIntelligence(signal); return { id: signal.id, title: object.title, description: `${object.status.replaceAll('-', ' ')} · ${relativeSignalAge(signal.timestamp)}`, object } }),
    provenance: [{ label: 'DERIVED_METRIC', description: 'Deterministic spatial, temporal, severity, diversity, and regional-baseline analysis.' }],
    methodology: memory?.method ?? 'Normalized Signals are clustered by time and H3 geography, then ranked with explainable deterministic components.',
    watchLabel: 'Watch this phenomenon',
  }
}

export function observerTaxonToIntelligence(taxon: LifeTaxonSummary, context: LifeContext, location: { latitude: number; longitude: number }): NexusIntelligenceObject {
  const commonName = taxon.commonName ?? taxon.scientificName
  return {
    id: `observer-${taxon.id}`, kind: 'species', domain: 'life', title: commonName,
    scientificName: taxon.commonName ? taxon.scientificName : undefined,
    subtitle: `${taxon.taxonomicClass ?? taxon.kingdom ?? 'LIFE'} · OBSERVED NEARBY`, status: 'recent',
    timestamp: taxon.latestObservation ?? context.retrievedAt, location,
    media: taxon.media ? [{ id: `${taxon.id}-photo`, kind: 'photo', url: taxon.media.url, title: commonName, alt: `Representative photograph of ${commonName}`, creator: taxon.media.creator, license: taxon.media.license, attribution: `${taxon.media.creator} · ${taxon.media.license}`, sourceUrl: taxon.media.sourceUrl, freshness: 'historical' }] : [],
    summary: `${taxon.count.toLocaleString()} permissively licensed recent observation${taxon.count === 1 ? '' : 's'} appeared in the bounded sample around this place.`,
    whyItMatters: 'Published observations can show which organisms have recently been documented nearby, but they do not measure abundance or prove a complete local range.',
    facts: [{ label: 'Sampled records', value: taxon.count.toLocaleString() }, { label: 'Group', value: taxon.taxonomicClass ?? taxon.kingdom ?? 'Unspecified' }, { label: 'Data license', value: taxon.license }],
    relationships: [], provenance: [{ label: 'OPEN_DATA', description: 'GBIF occurrence and species services; NEXUS accepts only CC0 and CC BY records.' }],
    methodology: context.methodology, sourceUrl: taxon.occurrenceUrl, watchLabel: 'Watch species',
  }
}

export function orbitalPassToIntelligence(pass: OrbitalPass, location: { latitude: number; longitude: number }): NexusIntelligenceObject {
  return {
    id: `pass-${pass.catalogId}-${pass.start}`, kind: 'orbital-pass', domain: 'orbit', title: pass.objectName,
    subtitle: 'UPCOMING PASS · CALCULATED LOCALLY', status: 'forecast', timestamp: pass.start, location, media: [],
    summary: `${pass.objectName} is calculated to rise above 18° from this location at ${new Date(pass.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
    whyItMatters: pass.darkSky ? 'This pass occurs during local darkness, improving the chance of seeing a sufficiently bright object.' : 'This pass occurs in daylight or twilight; unaided visibility may be limited.',
    whatMayHappenNext: `The pass peaks near ${pass.maxElevation}° and ends around ${new Date(pass.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Visibility still depends on illumination, clouds, obstructions, and current orbital elements.`,
    facts: [{ label: 'Catalog ID', value: String(pass.catalogId) }, { label: 'Peak elevation', value: `${pass.maxElevation}°` }, { label: 'Duration', value: `${Math.max(1, Math.round((pass.end - pass.start) / 60_000))} min` }],
    relationships: [], provenance: [{ label: 'DERIVED_METRIC', description: 'Propagated locally from public CelesTrak orbital elements using SGP4.' }],
    methodology: 'NEXUS samples the next 24 hours and identifies passes above an 18° elevation threshold. This is a calculated pass, not an observed sighting.',
    watchLabel: 'Watch orbital object',
  }
}

function relativeSignalAge(timestamp: number) {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000))
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 1440) return `${Math.round(minutes / 60)} hr ago`
  return `${Math.round(minutes / 1440)} days ago`
}

export function placeToIntelligence(city: GlobeCity): NexusIntelligenceObject {
  return {
    id: `place-${city.lat.toFixed(4)}-${city.lng.toFixed(4)}`, kind: 'place', domain: 'place', title: city.name,
    subtitle: city.country, status: 'historical', location: { latitude: city.lat, longitude: city.lng }, media: [],
    summary: `${city.name} is ${city.capital ? 'a capital city' : 'a mapped place'} in ${city.country}. Explore current weather, nearby activity, life, and what is overhead without leaving Earth.`,
    facts: [{ label: 'Population context', value: city.population.toLocaleString() }, { label: 'Place type', value: city.capital ? 'Capital city' : 'City' }], relationships: [],
    provenance: [{ label: 'OPEN_DATA', description: 'Place label derived from the bundled Natural Earth city catalog.' }],
    methodology: 'Place labels are selected by semantic zoom and population. Current local context is loaded only after selection.', watchLabel: 'Watch place',
  }
}

export function searchedPlaceToIntelligence(place: ObserverPlace): NexusIntelligenceObject {
  return {
    id: `place-${place.id}`, kind: 'place', domain: 'place', title: place.name,
    subtitle: place.subtitle, status: 'historical', evidence: 'reported',
    location: { latitude: place.latitude, longitude: place.longitude }, media: [],
    summary: `Explore what is happening now around ${place.name}. Current conditions and nearby evidence load only when requested.`,
    facts: [], relationships: [],
    provenance: [{ label: 'OPEN_DATA', description: 'Place result from Open-Meteo geocoding.' }],
    methodology: 'The selected place anchors a spatial query. NEXUS keeps provider details behind Sources.', watchLabel: 'Watch place',
  }
}

function safeUsgsMediaUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'usgs.gov' || url.hostname.endsWith('.usgs.gov')) ? url.toString() : undefined } catch { return undefined }
}

/** Load high-value event products only after selection; never for the global feed. */
export async function enrichSelectedIntelligence(object: NexusIntelligenceObject, signal?: AbortSignal): Promise<NexusIntelligenceObject> {
  const source = object.sourceSignal
  if (!source || source.source.provider !== 'usgs' || object.media.length) return object
  const detailUrl = safeUsgsMediaUrl(source.attributes.detailUrl)
  if (!detailUrl) return object
  try {
    const response = await fetchWithTimeout(detailUrl, { signal }, 7000)
    if (!response.ok) return object
    type UsgsProduct = { status?: string; preferredWeight?: number; updateTime?: number; contents?: Record<string, { url?: string; title?: string }> }
    const payload = await response.json() as { properties?: { products?: Record<string, UsgsProduct[]> } }
    const products = payload.properties?.products ?? {}
    const preferred = (items?: UsgsProduct[]) => [...(items ?? [])]
      .filter((item) => item.status?.toUpperCase() !== 'DELETE')
      .sort((a, b) => (b.preferredWeight ?? 0) - (a.preferredWeight ?? 0) || (b.updateTime ?? 0) - (a.updateTime ?? 0))[0]
    const shakeMap = preferred(products.shakemap)
    const dyfi = preferred(products.dyfi)
    const candidates: Array<{ kind: 'map' | 'diagram'; title: string; entry?: { url?: string; title?: string }; updatedAt?: number }> = [
      { kind: 'map', title: 'USGS ShakeMap', entry: shakeMap?.contents?.['download/intensity.jpg'] ?? shakeMap?.contents?.['download/shakemap.jpg'], updatedAt: shakeMap?.updateTime },
      { kind: 'diagram', title: 'Did You Feel It?', entry: dyfi?.contents?.['dyfi_plot_numresp.png'] ?? dyfi?.contents?.['dyfi_plot_atten.png'], updatedAt: dyfi?.updateTime },
    ]
    const media = candidates.flatMap((candidate, index) => {
      const url = safeUsgsMediaUrl(candidate.entry?.url)
      return url ? [{ id: `${object.id}-usgs-${index}`, kind: candidate.kind, role: 'current-evidence' as const, url, title: candidate.entry?.title ?? candidate.title, alt: `${candidate.title} for ${object.title}`, attribution: 'U.S. Geological Survey', sourceUrl: source.source.url, observedAt: candidate.updatedAt ?? source.timestamp, freshness: 'recent' as const }] : []
    })
    return media.length ? { ...object, media } : object
  } catch { return object }
}
