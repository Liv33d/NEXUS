import type { Signal, SignalType } from '../types/signal'

export type LayerCategory = 'ATMOSPHERE' | 'HAZARDS' | 'LIFE' | 'HUMAN' | 'OCEAN' | 'ORBIT' | 'CONTEXT'
export type LayerCost = 'low' | 'medium' | 'high'
export type NexusLayerId =
  | 'earthquakes' | 'volcanoes' | 'fires' | 'fema' | 'weather-alerts' | 'storms'
  | 'radar' | 'clouds' | 'environment' | 'aircraft' | 'satellites' | 'space-weather'
  | 'life' | 'ocean' | 'infrastructure' | 'media'

export interface NexusLayerDefinition {
  id: NexusLayerId
  label: string
  shortDescription: string
  category: LayerCategory
  defaultOpacity: number
  renderOrder: number
  semanticZoom: { minAltitude: number; maxAltitude: number }
  performanceCost: LayerCost
  provider?: string
  visualization: 'points' | 'clusters' | 'polygons' | 'raster' | 'corridors' | 'density' | 'tracks' | 'context'
  signalTypes?: SignalType[]
}

export const nexusLayers: NexusLayerDefinition[] = [
  { id: 'clouds', label: 'Satellite imagery', shortDescription: 'Latest GOES GeoColor · regional coverage', category: 'ATMOSPHERE', defaultOpacity: .34, renderOrder: 30, semanticZoom: { minAltitude: .05, maxAltitude: 5 }, performanceCost: 'high', provider: 'NOAA/NESDIS', visualization: 'raster' },
  { id: 'radar', label: 'Radar', shortDescription: 'Latest NOAA precipitation radar · coverage varies', category: 'ATMOSPHERE', defaultOpacity: .68, renderOrder: 40, semanticZoom: { minAltitude: .05, maxAltitude: 2.5 }, performanceCost: 'high', provider: 'NOAA/NWS MRMS', visualization: 'raster' },
  { id: 'storms', label: 'Storm tracks', shortDescription: 'Official tropical cyclone tracks', category: 'HAZARDS', defaultOpacity: 1, renderOrder: 70, semanticZoom: { minAltitude: .05, maxAltitude: 5 }, performanceCost: 'medium', provider: 'NOAA NHC', visualization: 'tracks', signalTypes: ['weather'] },
  { id: 'weather-alerts', label: 'Weather alerts', shortDescription: 'Severe official warnings', category: 'HAZARDS', defaultOpacity: .78, renderOrder: 65, semanticZoom: { minAltitude: .05, maxAltitude: 2.5 }, performanceCost: 'medium', provider: 'NWS', visualization: 'polygons', signalTypes: ['weather'] },
  { id: 'earthquakes', label: 'Earthquakes', shortDescription: 'Recent detected earthquakes', category: 'HAZARDS', defaultOpacity: 1, renderOrder: 80, semanticZoom: { minAltitude: .05, maxAltitude: 5 }, performanceCost: 'low', provider: 'USGS', visualization: 'clusters', signalTypes: ['earthquake'] },
  { id: 'volcanoes', label: 'Volcanoes', shortDescription: 'Official and global activity reports', category: 'HAZARDS', defaultOpacity: 1, renderOrder: 78, semanticZoom: { minAltitude: .05, maxAltitude: 5 }, performanceCost: 'low', visualization: 'points', signalTypes: ['environment'] },
  { id: 'fires', label: 'Thermal activity', shortDescription: 'Satellite thermal detections and fire events', category: 'HAZARDS', defaultOpacity: .92, renderOrder: 76, semanticZoom: { minAltitude: .05, maxAltitude: 4 }, performanceCost: 'medium', provider: 'NASA', visualization: 'clusters', signalTypes: ['fire'] },
  { id: 'fema', label: 'FEMA disasters', shortDescription: 'Recent U.S. federal disaster declarations', category: 'HUMAN', defaultOpacity: .9, renderOrder: 72, semanticZoom: { minAltitude: .08, maxAltitude: 3.5 }, performanceCost: 'low', provider: 'OpenFEMA', visualization: 'context', signalTypes: ['environment'] },
  { id: 'life', label: 'Animals & plants', shortDescription: 'Recent licensed biodiversity observations', category: 'LIFE', defaultOpacity: .82, renderOrder: 50, semanticZoom: { minAltitude: .06, maxAltitude: 3.5 }, performanceCost: 'medium', provider: 'GBIF', visualization: 'density' },
  { id: 'aircraft', label: 'Aircraft', shortDescription: 'Available public aircraft activity', category: 'HUMAN', defaultOpacity: .86, renderOrder: 85, semanticZoom: { minAltitude: .03, maxAltitude: 1.5 }, performanceCost: 'high', visualization: 'clusters', signalTypes: ['aircraft'] },
  { id: 'satellites', label: 'Satellites', shortDescription: 'Selected orbital objects', category: 'ORBIT', defaultOpacity: .88, renderOrder: 90, semanticZoom: { minAltitude: .05, maxAltitude: 5 }, performanceCost: 'medium', visualization: 'tracks', signalTypes: ['satellite'] },
  { id: 'space-weather', label: 'Space weather', shortDescription: 'Solar and geomagnetic conditions', category: 'ORBIT', defaultOpacity: .9, renderOrder: 45, semanticZoom: { minAltitude: .05, maxAltitude: 5 }, performanceCost: 'low', provider: 'NOAA SWPC', visualization: 'context', signalTypes: ['space-weather'] },
  { id: 'ocean', label: 'Ocean', shortDescription: 'Marine hazards and modeled conditions', category: 'OCEAN', defaultOpacity: .78, renderOrder: 35, semanticZoom: { minAltitude: .03, maxAltitude: 3 }, performanceCost: 'medium', visualization: 'density', signalTypes: ['environment'] },
  { id: 'environment', label: 'Environment', shortDescription: 'Flood, drought, ice, and other Earth systems', category: 'CONTEXT', defaultOpacity: .8, renderOrder: 42, semanticZoom: { minAltitude: .04, maxAltitude: 4 }, performanceCost: 'medium', visualization: 'clusters', signalTypes: ['environment'] },
  { id: 'infrastructure', label: 'Infrastructure', shortDescription: 'Public geographic infrastructure context', category: 'HUMAN', defaultOpacity: .8, renderOrder: 38, semanticZoom: { minAltitude: .02, maxAltitude: 1.2 }, performanceCost: 'medium', visualization: 'points', signalTypes: ['infrastructure'] },
  { id: 'media', label: 'Media context', shortDescription: 'Clearly labeled public media activity', category: 'CONTEXT', defaultOpacity: .66, renderOrder: 25, semanticZoom: { minAltitude: .03, maxAltitude: 1.4 }, performanceCost: 'medium', visualization: 'clusters', signalTypes: ['media'] },
]

export const allLayerIds = nexusLayers.map((layer) => layer.id)
export const defaultLayerIds: NexusLayerId[] = ['earthquakes', 'volcanoes', 'fires', 'fema', 'weather-alerts', 'storms', 'environment', 'space-weather']
export const livingEarthLayerIds: NexusLayerId[] = ['earthquakes', 'volcanoes', 'fires', 'fema', 'weather-alerts', 'storms', 'life', 'environment', 'space-weather']

export const layerPresets: Record<'world' | 'weather' | 'hazards' | 'life' | 'maritime' | 'aviation' | 'orbit', NexusLayerId[]> = {
  world: livingEarthLayerIds,
  weather: ['clouds', 'radar', 'storms', 'weather-alerts', 'environment'],
  hazards: ['earthquakes', 'volcanoes', 'fires', 'fema', 'storms', 'weather-alerts'],
  life: ['life', 'environment'],
  maritime: ['ocean', 'storms', 'weather-alerts', 'clouds'],
  aviation: ['aircraft', 'weather-alerts', 'radar', 'clouds'],
  orbit: ['satellites', 'space-weather'],
}

export function signalLayerId(signal: Signal): NexusLayerId {
  if (signal.source.provider === 'openfema') return 'fema'
  if (signal.source.provider === 'nhc') return 'storms'
  if (signal.source.provider === 'nws') return 'weather-alerts'
  if (signal.type === 'earthquake') return 'earthquakes'
  if (signal.type === 'fire') return 'fires'
  if (signal.type === 'aircraft') return 'aircraft'
  if (signal.type === 'satellite') return 'satellites'
  if (signal.type === 'space-weather') return 'space-weather'
  if (signal.type === 'infrastructure') return 'infrastructure'
  if (signal.type === 'media') return 'media'
  if (String(signal.attributes.eventType ?? '').toUpperCase() === 'VO' || signal.source.provider === 'volcano') return 'volcanoes'
  return 'environment'
}

export function layerSupportsSignal(layerId: NexusLayerId, signal: Signal): boolean {
  return signalLayerId(signal) === layerId
}

export function visibleWithLayers(signal: Signal, enabled: ReadonlySet<NexusLayerId>): boolean {
  return enabled.has(signalLayerId(signal))
}

export function enabledLayerSummary(enabled: ReadonlySet<NexusLayerId>): string[] {
  return nexusLayers.filter((layer) => enabled.has(layer.id)).sort((a, b) => b.renderOrder - a.renderOrder).map((layer) => layer.label)
}
