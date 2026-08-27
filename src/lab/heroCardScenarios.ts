import { lifeTaxonToIntelligence, placeToIntelligence, signalToIntelligence } from '../lib/intelligence'
import { normalizeFirmsCsv } from '../providers/firms'
import { normalizeNhc } from '../providers/nhc'
import { normalizeUsgs } from '../providers/usgs'
import { normalizeVolcanoes } from '../providers/volcano'
import type { NexusIntelligenceObject } from '../types/intelligence'
import type { Signal } from '../types/signal'

export const HERO_LAB_TIME = Date.UTC(2026, 4, 14, 18, 0)

export type HeroScenarioId = 'bird' | 'hurricane' | 'volcano' | 'earthquake' | 'fire-unclassified' | 'fire-corroborated' | 'place'

export interface HeroCardScenario {
  id: HeroScenarioId
  label: string
  build(): NexusIntelligenceObject
  expected: {
    domain: NexusIntelligenceObject['domain']
    title: string
    evidence?: NexusIntelligenceObject['evidence']
    mediaPolicy: 'licensed-fixture' | 'honest-fallback'
  }
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Hero lab fixture did not normalize ${label}`)
  return value
}

function diagram(label: string, accent: string) {
  const safeLabel = label.replace(/[<>&"']/g, '')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 700"><defs><radialGradient id="g"><stop stop-color="${accent}" stop-opacity=".55"/><stop offset="1" stop-color="#061011"/></radialGradient></defs><rect width="1200" height="700" fill="#061011"/><circle cx="850" cy="210" r="330" fill="url(#g)"/><path d="M90 520 C300 250 560 610 1110 180" fill="none" stroke="${accent}" stroke-width="18" stroke-linecap="round" stroke-dasharray="22 28"/><text x="90" y="105" fill="#eaf5f3" font-family="system-ui" font-size="54" font-weight="700">${safeLabel}</text><text x="92" y="158" fill="#9eb0ae" font-family="system-ui" font-size="23">DETERMINISTIC LAYOUT FIXTURE · NOT REAL-WORLD EVIDENCE</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function fixtureObject(object: NexusIntelligenceObject, media?: NexusIntelligenceObject['media']): NexusIntelligenceObject {
  const provider = object.sourceSignal?.source.provider ?? object.provenance[0]?.description.match(/\b(?:NOAA|NHC|USGS|GBIF|NASA|FIRMS|Natural Earth)\b/i)?.[0] ?? 'provider'
  const fixtureProvenance = [{
    label: 'DEMO_DATA' as const,
    description: `Deterministic Hero Card Lab fixture shaped like normalized ${provider} evidence. It is not a provider record, live data, or an authoritative status.`,
  }]
  return {
    ...object,
    sourceUrl: undefined,
    sourceSignal: undefined,
    media: (media ?? object.media).map((item) => ({ ...item, sourceUrl: undefined })),
    relationships: object.relationships.map((relationship) => ({
      ...relationship,
      object: relationship.object ? {
        ...relationship.object,
        sourceUrl: undefined,
        sourceSignal: undefined,
        media: relationship.object.media.map((item) => ({ ...item, sourceUrl: undefined })),
        provenance: fixtureProvenance,
      } : undefined,
    })),
    provenance: fixtureProvenance,
  }
}

function bird(): NexusIntelligenceObject {
  const object = lifeTaxonToIntelligence({
    id: 'lab-bird-gray-cheeked-thrush', taxonKey: 2492484, scientificName: 'Catharus minimus', commonName: 'Gray-cheeked Thrush',
    observations: 47, latitude: 35.8, longitude: -79.1, taxonomicClass: 'Aves', sourceUrl: 'https://www.gbif.org/species/2492484',
  }, HERO_LAB_TIME, 'Privacy-safe Golden Bird fixture using a coarse H3 presentation cell with at least five qualifying records. It does not infer migration, abundance, or range.')
  return fixtureObject({ ...object, summary: 'Published observations document this small thrush in a coarse regional sample without exposing an individual wildlife location.', whyItMatters: 'This bird crosses continents seasonally, but this card makes no route claim from occurrence centroids.' }, [{
    id: 'lab-bird-diagram', kind: 'diagram', role: 'representative', url: diagram('GRAY-CHEEKED THRUSH', '#a5df83'),
    title: 'Bird presentation fixture', alt: 'Abstract green route used to test the bird intelligence-card layout',
    creator: 'NEXUS test suite', license: 'CC0-1.0', attribution: 'NEXUS test suite · CC0-1.0', freshness: 'derived',
  }])
}

function hurricane(): NexusIntelligenceObject {
  const signal = required(normalizeNhc({
    generatedAt: '2026-05-14T17:00:00Z',
    features: [
      { type: 'Feature', properties: { stormId: 'al012026', name: 'Hurricane Iris (Advisory #8) - Forecast Track', product: 'track', sourceUrl: 'https://www.nhc.noaa.gov/', validFrom: '2026-05-14T17:00:00Z', validUntil: '2026-05-19T17:00:00Z' }, geometry: { type: 'LineString', coordinates: [[-67, 19], [-69, 20.5], [-72, 22.4]] } },
      { type: 'Feature', properties: { stormId: 'al012026', name: 'Hurricane Iris (Advisory #8) - Forecast Track Uncertainty', product: 'cone', sourceUrl: 'https://www.nhc.noaa.gov/' }, geometry: { type: 'Polygon', coordinates: [[[-68, 18], [-65, 19], [-71, 24], [-74, 23], [-68, 18]]] } },
    ],
  }, HERO_LAB_TIME)[0], 'hurricane')
  const object = signalToIntelligence(signal)
  return fixtureObject(object, [{
    id: 'lab-hurricane-track', kind: 'map', role: 'forecast', url: diagram('OFFICIAL TRACK LAYOUT', '#74b7ff'),
    title: 'Forecast-track fixture', alt: 'Abstract blue forecast path used to test the hurricane card layout',
    creator: 'NEXUS test suite', license: 'CC0-1.0', attribution: 'NEXUS test suite · CC0-1.0', freshness: 'derived',
  }])
}

function volcano(): NexusIntelligenceObject {
  const signal = required(normalizeVolcanoes({ type: 'FeatureCollection', features: [{
    type: 'Feature', geometry: { type: 'Point', coordinates: [-155.292, 19.421] }, properties: {
      volcanoName: 'Kilauea', vnum: '332010', volcanoCd: 'KILA', volcanoUrl: 'https://www.usgs.gov/volcanoes/kilauea', volcanoImage: 'https://example.invalid/unlicensed.jpg',
      obs: 'hvo', region: 'Hawaii', noticeSynopsis: 'Kilauea remains at an elevated official alert level in this deterministic fixture.', noticeUrl: 'https://volcanoes.usgs.gov/',
      alertLevel: 'WATCH', colorCode: 'ORANGE', alertDate: '2026-05-14 16:30:00', colorDate: '2026-05-14 16:30:00', nvewsThreat: 'Very High Threat',
    },
  }] }, HERO_LAB_TIME)[0], 'volcano')
  return fixtureObject(signalToIntelligence(signal))
}

function earthquake(): NexusIntelligenceObject {
  const signal = required(normalizeUsgs({ features: [{
    id: 'lab-quake', properties: { mag: 6.1, place: '84 km east of Hualien, Taiwan', time: HERO_LAB_TIME - 38 * 60_000, updated: HERO_LAB_TIME - 25 * 60_000,
      url: 'https://earthquake.usgs.gov/', felt: 418, cdi: 5.2, mmi: 6.1, alert: 'yellow', status: 'reviewed', tsunami: 0, sig: 694, type: 'earthquake', title: 'M 6.1 - 84 km east of Hualien, Taiwan' },
    geometry: { type: 'Point', coordinates: [122.48, 24.08, 18] },
  }] }, HERO_LAB_TIME)[0], 'earthquake')
  const object = signalToIntelligence(signal)
  return fixtureObject(object, [{
    id: 'lab-shakemap', kind: 'map', role: 'current-evidence', url: diagram('SHAKEMAP LAYOUT', '#ef9d68'),
    title: 'ShakeMap layout fixture', alt: 'Abstract orange intensity field used to test the earthquake card layout',
    creator: 'NEXUS test suite', license: 'CC0-1.0', attribution: 'NEXUS test suite · CC0-1.0', observedAt: signal.timestamp, freshness: 'derived',
  }])
}

function firmsSignal(): Signal {
  const csv = `latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,frp,bright_ti4,daynight,scan,track\n34.1800,-117.3200,2026-05-14,1640,NOAA-20,VIIRS,h,86.4,344.1,D,0.4,0.4`
  return required(normalizeFirmsCsv(csv, HERO_LAB_TIME)[0], 'thermal detection')
}

function fire(corroborated: boolean): NexusIntelligenceObject {
  const thermal = firmsSignal()
  const evidence: Signal[] = corroborated ? [{
    id: 'lab-eonet-fire', source: { provider: 'eonet', dataset: 'EONET Wildfires', url: 'https://eonet.gsfc.nasa.gov/', retrievedAt: HERO_LAB_TIME, freshness: 'delayed' },
    type: 'fire', title: 'Wildfire — San Bernardino County', summary: 'A separate event feed reports wildfire activity in this area.', timestamp: thermal.timestamp,
    location: { latitude: 34.19, longitude: -117.31 }, attributes: {}, provenance: [{ label: 'DEMO_DATA', description: 'Deterministic corroboration fixture.' }],
  }] : []
  return fixtureObject(signalToIntelligence(thermal, evidence))
}

function place(): NexusIntelligenceObject {
  return fixtureObject(placeToIntelligence({ name: 'San Juan', country: 'Puerto Rico', lat: 18.4655, lng: -66.1057, population: 418140, capital: true, minZoom: 5 }))
}

export const heroCardScenarios = [
  { id: 'bird', label: 'Bird', build: bird, expected: { domain: 'life', title: 'Gray-cheeked Thrush', evidence: 'observed', mediaPolicy: 'licensed-fixture' } },
  { id: 'hurricane', label: 'Hurricane', build: hurricane, expected: { domain: 'weather', title: 'Hurricane Iris is being tracked', evidence: 'predicted', mediaPolicy: 'licensed-fixture' } },
  { id: 'volcano', label: 'Volcano', build: volcano, expected: { domain: 'hazards', title: 'Kilauea', evidence: 'reported', mediaPolicy: 'honest-fallback' } },
  { id: 'earthquake', label: 'Earthquake', build: earthquake, expected: { domain: 'hazards', title: 'Strong earthquake near 84 km east of Hualien, Taiwan', evidence: 'observed', mediaPolicy: 'licensed-fixture' } },
  { id: 'fire-unclassified', label: 'Thermal · unknown', build: () => fire(false), expected: { domain: 'hazards', title: 'Unclassified thermal anomaly', evidence: 'observed', mediaPolicy: 'honest-fallback' } },
  { id: 'fire-corroborated', label: 'Thermal · corroborated', build: () => fire(true), expected: { domain: 'hazards', title: 'Possible fire activity', evidence: 'possible', mediaPolicy: 'honest-fallback' } },
  { id: 'place', label: 'Place', build: place, expected: { domain: 'place', title: 'San Juan', mediaPolicy: 'honest-fallback' } },
] as const satisfies readonly HeroCardScenario[]

export function heroScenario(id: HeroScenarioId): HeroCardScenario {
  return required(heroCardScenarios.find((scenario) => scenario.id === id), id)
}
