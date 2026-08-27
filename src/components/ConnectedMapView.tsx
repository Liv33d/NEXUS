import { useEffect, useMemo, useRef, useState } from 'react'
import type { FeatureCollection, LineString, Point } from 'geojson'
import { Map as MapLibreMap, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { environmentalFrameReference, environmentalLayers, nasaTrueColorTilesForDate, noaaGeoColorTileTemplate, noaaRadarTileTemplate } from '../lib/mapLayers'
import { signalAreasGeoJSON } from '../lib/geospatial'
import type { Signal } from '../types/signal'
import { altitudeToMapZoom, clampGeographicView, DEFAULT_GEOGRAPHIC_VIEW, mapZoomToAltitude, type GeographicView } from '../lib/geography'
import type { MigrationSnapshot } from '../lib/migration'
import type { LifeGlobeSnapshot } from '../lib/lifeGlobe'

setWorkerUrl(mapWorkerUrl)

interface Props {
  signals: Signal[]
  selected?: Signal
  focusLocation?: { latitude: number; longitude: number }
  onSelect(signal: Signal): void
  onSelectSignalCluster?(signals: Signal[], location: { latitude: number; longitude: number }): void
  onSelectMigration?(corridor: MigrationSnapshot['corridors'][number]): void
  onSelectLife?(taxon: LifeGlobeSnapshot['taxa'][number]): void
  onSelectEcologicalCell?(cell: { id: string; latitude: number; longitude: number; observations: number; domain: 'migration' | 'life' }): void
  radarEnabled?: boolean
  satelliteEnabled?: boolean
  mapTheme?: 'dark' | 'street'
  performanceMode?: 'automatic' | 'quality' | 'battery'
  onFallback(): void
  initialView?: GeographicView
  onViewChange?(view: GeographicView): void
  onRequestGlobe?(): void
  migration?: MigrationSnapshot
  life?: LifeGlobeSnapshot
  active?: boolean
  environmentalTime?: number
}

type SignalProperties = { id: string; title: string; type: Signal['type']; severity: number }

function signalCollection(signals: Signal[]): FeatureCollection<Point, SignalProperties> {
  return {
    type: 'FeatureCollection',
    features: signals.filter((signal) => signal.location).slice(0, 5000).map((signal) => ({
      type: 'Feature',
      id: signal.id,
      properties: { id: signal.id, title: signal.title.slice(0, 180), type: signal.type, severity: Math.max(0, Math.min(100, signal.severity ?? 20)) },
      geometry: { type: 'Point', coordinates: [signal.location!.longitude, signal.location!.latitude] },
    })),
  }
}

function selectionCollection(location?: { latitude: number; longitude: number }): FeatureCollection<Point, Record<string, never>> {
  return {
    type: 'FeatureCollection',
    features: location ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [location.longitude, location.latitude] } }] : [],
  }
}

function forecastTracks(signals: Signal[]): FeatureCollection<LineString, { id: string; title: string }> {
  return { type: 'FeatureCollection', features: signals.flatMap((signal) => {
    const value = signal.attributes.forecastTrack
    if (!Array.isArray(value)) return []
    const coordinates = value.filter((item): item is [number, number] => Array.isArray(item) && item.length >= 2 && typeof item[0] === 'number' && typeof item[1] === 'number' && Math.abs(item[0]) <= 180 && Math.abs(item[1]) <= 90)
    return coordinates.length >= 2 ? [{ type: 'Feature' as const, properties: { id: signal.id, title: signal.title }, geometry: { type: 'LineString' as const, coordinates } }] : []
  }) }
}

function migrationTracks(snapshot?: MigrationSnapshot): FeatureCollection<LineString, { id: string; name: string; confidence: number }> {
  return { type: 'FeatureCollection', features: (snapshot?.corridors ?? []).slice(0, 80).map((corridor) => ({
    type: 'Feature', properties: { id: corridor.id, name: corridor.commonName ?? corridor.species, confidence: corridor.confidence },
    geometry: { type: 'LineString', coordinates: [[corridor.startLongitude, corridor.startLatitude], [corridor.endLongitude, corridor.endLatitude]] },
  })) }
}

function lifeDensity(migration?: MigrationSnapshot, life?: LifeGlobeSnapshot): FeatureCollection<Point, { id: string; observations: number; domain: 'migration' | 'life'; itemKind: 'cell' | 'taxon' }> {
  return { type: 'FeatureCollection', features: [
    ...(migration?.cells ?? []).map((cell) => ({ type: 'Feature' as const, properties: { id: cell.id, observations: cell.observations, domain: 'migration' as const, itemKind: 'cell' as const }, geometry: { type: 'Point' as const, coordinates: [cell.longitude, cell.latitude] } })),
    ...(life?.cells ?? []).map((cell) => ({ type: 'Feature' as const, properties: { id: cell.id, observations: cell.observations, domain: 'life' as const, itemKind: 'cell' as const }, geometry: { type: 'Point' as const, coordinates: [cell.longitude, cell.latitude] } })),
    ...(life?.taxa ?? []).map((taxon) => ({ type: 'Feature' as const, properties: { id: taxon.id, observations: taxon.observations, domain: 'life' as const, itemKind: 'taxon' as const }, geometry: { type: 'Point' as const, coordinates: [taxon.longitude, taxon.latitude] } })),
  ].sort((a, b) => b.properties.observations - a.properties.observations).slice(0, 500) }
}

type WeatherKind = 'radar' | 'satellite'
type WeatherSlot = 'a' | 'b'
interface WeatherLayerState { active?: WeatherSlot; url?: string; cleanup?: () => void }

function firstSymbolLayer(map: MapLibreMap) {
  return map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id
}

function weatherId(kind: WeatherKind, slot: WeatherSlot) { return `nexus-${kind}-${slot}` }

function orderWeatherLayers(map: MapLibreMap) {
  const anchor = firstSymbolLayer(map)
  if (!anchor) return
  for (const kind of ['satellite', 'radar'] as const) {
    for (const slot of ['a', 'b'] as const) {
      const id = weatherId(kind, slot)
      if (map.getLayer(id)) map.moveLayer(id, anchor)
    }
  }
}

function removeLayerAndSource(map: MapLibreMap, id: string) {
  if (map.getLayer(id)) map.removeLayer(id)
  if (map.getSource(id)) map.removeSource(id)
}

function clearWeatherLayer(map: MapLibreMap, kind: WeatherKind, state: WeatherLayerState) {
  state.cleanup?.()
  for (const slot of ['a', 'b'] as const) removeLayerAndSource(map, weatherId(kind, slot))
  state.active = undefined
  state.url = undefined
  state.cleanup = undefined
}

function stageWeatherLayer(map: MapLibreMap, kind: WeatherKind, url: string, opacity: number, attribution: string, state: WeatherLayerState, onReady: () => void, onFailure: () => void, maxzoom?: number) {
  if (state.url === url && state.active) return
  state.cleanup?.()
  const next: WeatherSlot = state.active === 'a' ? 'b' : 'a'
  const nextId = weatherId(kind, next)
  removeLayerAndSource(map, nextId)
  map.addSource(nextId, { type: 'raster', tiles: [url], tileSize: 256, attribution, ...(maxzoom === undefined ? {} : { maxzoom }) })
  map.addLayer({ id: nextId, type: 'raster', source: nextId, paint: { 'raster-opacity': state.active ? 0 : opacity, 'raster-fade-duration': 350, 'raster-resampling': 'linear' } }, firstSymbolLayer(map))
  orderWeatherLayers(map)
  let settled = false
  const finish = () => {
    if (settled || !map.getSource(nextId)) return
    settled = true
    const previousId = state.active ? weatherId(kind, state.active) : undefined
    map.setPaintProperty(nextId, 'raster-opacity', opacity)
    if (previousId && map.getLayer(previousId)) map.setPaintProperty(previousId, 'raster-opacity', 0)
    const removal = window.setTimeout(() => { if (previousId) removeLayerAndSource(map, previousId) }, 480)
    state.active = next
    state.url = url
    state.cleanup = () => window.clearTimeout(removal)
    onReady()
    map.off('sourcedata', loaded)
    window.clearTimeout(timeout)
  }
  const loaded = (event: { sourceId?: string; isSourceLoaded?: boolean }) => {
    if (event.sourceId === nextId && (event.isSourceLoaded || map.isSourceLoaded(nextId))) finish()
  }
  map.on('sourcedata', loaded)
  const timeout = window.setTimeout(() => {
    if (settled) return
    settled = true
    map.off('sourcedata', loaded)
    removeLayerAndSource(map, nextId)
    state.cleanup = undefined
    onFailure()
  }, 9_000)
  state.cleanup = () => { map.off('sourcedata', loaded); window.clearTimeout(timeout) }
}

function applyNexusEarthStyle(map: MapLibreMap) {
  const safePaint = (id: string, property: string, value: unknown) => {
    if (!map.getLayer(id)) return
    try { map.setPaintProperty(id, property as never, value as never) } catch { /* Remote styles can rename or change layer types. */ }
  }
  if (!map.getSource('nexus-natural-relief')) map.addSource('nexus-natural-relief', {
    type: 'raster', tiles: ['https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 6,
    attribution: 'Natural Earth',
  })
  if (!map.getLayer('nexus-natural-relief')) map.addLayer({
    id: 'nexus-natural-relief', type: 'raster', source: 'nexus-natural-relief', maxzoom: 7,
    paint: {
      'raster-opacity': ['interpolate', ['linear'], ['zoom'], 0, .88, 3, .7, 6, .08, 7, 0],
      'raster-saturation': -.12, 'raster-contrast': .08, 'raster-brightness-min': .08, 'raster-brightness-max': .86,
      'raster-resampling': 'linear', 'raster-fade-duration': 250,
    },
  }, map.getLayer('water') ? 'water' : firstSymbolLayer(map))
  safePaint('background', 'background-color', '#010507')
  safePaint('water', 'fill-color', '#092633')
  safePaint('water', 'fill-opacity', .78)
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type === 'line' && /boundary|admin/i.test(layer.id)) {
      safePaint(layer.id, 'line-color', 'rgba(191, 204, 201, .34)')
      safePaint(layer.id, 'line-opacity', ['interpolate', ['linear'], ['zoom'], 0, .22, 5, .48])
    }
    if (layer.type === 'symbol' && /place|country|city|town/i.test(layer.id)) {
      safePaint(layer.id, 'text-color', '#c6cfcc')
      safePaint(layer.id, 'text-halo-color', 'rgba(2, 8, 10, .9)')
      safePaint(layer.id, 'text-halo-width', 1.4)
    }
  }
}

export default function ConnectedMapView({ signals, selected, focusLocation, onSelect, onSelectSignalCluster, onSelectMigration, onSelectLife, onSelectEcologicalCell, radarEnabled = false, satelliteEnabled = false, mapTheme = 'dark', performanceMode = 'automatic', onFallback, initialView = DEFAULT_GEOGRAPHIC_VIEW, onViewChange, migration, life, active = true, environmentalTime }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const signalsRef = useRef(signals)
  const onSelectRef = useRef(onSelect)
  const onSelectSignalClusterRef = useRef(onSelectSignalCluster)
  const onSelectMigrationRef = useRef(onSelectMigration)
  const onSelectLifeRef = useRef(onSelectLife)
  const onSelectEcologicalCellRef = useRef(onSelectEcologicalCell)
  const migrationRef = useRef(migration)
  const lifeRef = useRef(life)
  const onViewChangeRef = useRef(onViewChange)
  const initialViewRef = useRef(initialView)
  const previousSelectedId = useRef<string | undefined>(undefined)
  const weatherLayers = useRef<Record<WeatherKind, WeatherLayerState>>({ radar: {}, satellite: {} })
  const [ready, setReady] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const [layerReference, setLayerReference] = useState(Date.now)
  const [loadedAt, setLoadedAt] = useState<Partial<Record<WeatherKind, number>>>({})
  const [weatherStatus, setWeatherStatus] = useState<Partial<Record<WeatherKind, 'loading' | 'ready' | 'delayed' | 'unavailable'>>>({})
  const collection = useMemo(() => signalCollection(signals), [signals])
  const areas = useMemo(() => signalAreasGeoJSON(signals), [signals])
  const tracks = useMemo(() => forecastTracks(signals), [signals])
  const migrationLines = useMemo(() => migrationTracks(migration), [migration])
  const ecologicalDensity = useMemo(() => lifeDensity(migration, life), [life, migration])

  useEffect(() => {
    if ((!radarEnabled && !satelliteEnabled) || !active) return
    const refresh = () => { if (document.visibilityState === 'visible') setLayerReference(Date.now()) }
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [active, radarEnabled, satelliteEnabled])

  useEffect(() => { signalsRef.current = signals; onSelectRef.current = onSelect; onSelectSignalClusterRef.current = onSelectSignalCluster; onSelectMigrationRef.current = onSelectMigration; onSelectLifeRef.current = onSelectLife; onSelectEcologicalCellRef.current = onSelectEcologicalCell; migrationRef.current = migration; lifeRef.current = life; onViewChangeRef.current = onViewChange }, [life, migration, onSelect, onSelectEcologicalCell, onSelectLife, onSelectMigration, onSelectSignalCluster, onViewChange, signals])

  useEffect(() => {
    if (!hostRef.current) return
    const weatherLayerStates = weatherLayers.current
    let settled = false
    const timeout = window.setTimeout(() => { if (!settled) onFallback() }, 14_000)
    const initial = clampGeographicView(initialViewRef.current)
    const map = new MapLibreMap({
      container: hostRef.current,
      style: `https://tiles.openfreemap.org/styles/${mapTheme === 'street' ? 'liberty' : 'dark'}`,
      center: [initial.longitude, initial.latitude], zoom: altitudeToMapZoom(initial.altitude), minZoom: 0, maxZoom: 16,
      pixelRatio: Math.min(window.devicePixelRatio || 1, performanceMode === 'quality' ? 2 : performanceMode === 'battery' ? 1 : 1.5),
      pitchWithRotate: false, dragRotate: false, touchPitch: false,
      attributionControl: {},
    })
    map.setProjection({ type: 'globe' })
    mapRef.current = map
    map.once('load', () => {
      settled = true
      window.clearTimeout(timeout)
      map.setSky({
        'sky-color': '#010305',
        'horizon-color': '#7f999d',
        'fog-color': '#132229',
        'sky-horizon-blend': .18,
        'horizon-fog-blend': .48,
        'fog-ground-blend': .34,
      })
      applyNexusEarthStyle(map)
      map.addSource('nexus-signals', { type: 'geojson', data: signalCollection(signalsRef.current), cluster: true, clusterMaxZoom: 7, clusterRadius: 42 })
      map.addSource('nexus-areas', { type: 'geojson', data: signalAreasGeoJSON(signalsRef.current) })
      map.addLayer({ id: 'nexus-area-fill', type: 'fill', source: 'nexus-areas', paint: { 'fill-color': '#74b7ff', 'fill-opacity': .13 } })
      map.addLayer({ id: 'nexus-area-outline', type: 'line', source: 'nexus-areas', paint: { 'line-color': '#9ad2ff', 'line-width': 1.4, 'line-opacity': .82 } })
      map.addSource('nexus-tracks', { type: 'geojson', data: forecastTracks(signalsRef.current) })
      map.addLayer({ id: 'nexus-track-hit', type: 'line', source: 'nexus-tracks', paint: { 'line-color': '#000000', 'line-width': 24, 'line-opacity': .001 } })
      map.addLayer({ id: 'nexus-track-lines', type: 'line', source: 'nexus-tracks', paint: { 'line-color': '#d7f0ff', 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': .9 } })
      map.addSource('nexus-life-density', { type: 'geojson', data: lifeDensity() })
      map.addLayer({ id: 'nexus-life-density', type: 'circle', source: 'nexus-life-density', maxzoom: 5.5, filter: ['==', ['get', 'itemKind'], 'cell'], paint: { 'circle-color': ['match', ['get', 'domain'], 'migration', '#b7dca0', '#69bfc0'], 'circle-radius': ['interpolate', ['linear'], ['get', 'observations'], 1, 5, 30, 15], 'circle-opacity': ['interpolate', ['linear'], ['zoom'], 0, .14, 5.5, .3], 'circle-blur': .52 } })
      map.addLayer({ id: 'nexus-life-taxa', type: 'circle', source: 'nexus-life-density', minzoom: 4, filter: ['==', ['get', 'itemKind'], 'taxon'], paint: { 'circle-color': '#9bcf79', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 10, 8], 'circle-opacity': .82, 'circle-stroke-width': 1.2, 'circle-stroke-color': '#f4ffe9' } })
      map.addLayer({ id: 'nexus-life-taxa-hit', type: 'circle', source: 'nexus-life-density', minzoom: 4, filter: ['==', ['get', 'itemKind'], 'taxon'], paint: { 'circle-color': '#000000', 'circle-radius': 22, 'circle-opacity': .001 } })
      map.addSource('nexus-migration', { type: 'geojson', data: migrationTracks() })
      map.addLayer({ id: 'nexus-migration-hit', type: 'line', source: 'nexus-migration', minzoom: 2, maxzoom: 9, paint: { 'line-color': '#000000', 'line-width': 24, 'line-opacity': .001 } })
      map.addLayer({ id: 'nexus-migration', type: 'line', source: 'nexus-migration', minzoom: 2, maxzoom: 9, paint: { 'line-color': '#b7dca0', 'line-width': ['interpolate', ['linear'], ['zoom'], 2, .6, 8, 1.6], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 2, .22, 6, .48], 'line-dasharray': [1.5, 3.5] } })
      map.addLayer({ id: 'nexus-clusters', type: 'circle', source: 'nexus-signals', filter: ['has', 'point_count'], paint: { 'circle-color': ['step', ['get', 'point_count'], '#315f5d', 25, '#367d77', 100, '#d08d55'], 'circle-radius': ['step', ['get', 'point_count'], 15, 25, 20, 100, 27], 'circle-stroke-width': 1.5, 'circle-stroke-color': '#bffff6', 'circle-opacity': .88 } })
      map.addLayer({ id: 'nexus-cluster-count', type: 'symbol', source: 'nexus-signals', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 10 }, paint: { 'text-color': '#efffff' } })
      map.addLayer({ id: 'nexus-signal-halo', type: 'circle', source: 'nexus-signals', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': ['match', ['get', 'type'], 'earthquake', '#ffb35c', 'fire', '#ff755e', 'weather', '#74b7ff', 'aircraft', '#8ff5e8', 'satellite', '#b9a4ff', 'space-weather', '#d6a4ff', 'media', '#f2da87', 'environment', '#74d9a1', '#c7d0d0'], 'circle-radius': ['interpolate', ['linear'], ['get', 'severity'], 0, 7, 100, 17], 'circle-opacity': .14 } })
      map.addLayer({ id: 'nexus-signal-hit', type: 'circle', source: 'nexus-signals', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': '#000000', 'circle-radius': 22, 'circle-opacity': .001 } })
      map.addLayer({ id: 'nexus-signal-points', type: 'circle', source: 'nexus-signals', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': ['match', ['get', 'type'], 'earthquake', '#ffb35c', 'fire', '#ff755e', 'weather', '#74b7ff', 'aircraft', '#8ff5e8', 'satellite', '#b9a4ff', 'space-weather', '#d6a4ff', 'media', '#f2da87', 'environment', '#74d9a1', '#c7d0d0'], 'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 11, ['interpolate', ['linear'], ['zoom'], 1, 3.5, 8, 7]], 'circle-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 1, .82], 'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1.25], 'circle-stroke-color': '#ecfffc' } })
      map.addSource('nexus-selection', { type: 'geojson', data: selectionCollection() })
      map.addLayer({ id: 'nexus-selection-halo', type: 'circle', source: 'nexus-selection', paint: { 'circle-color': '#dffffa', 'circle-radius': 22, 'circle-opacity': .16, 'circle-blur': .18, 'circle-stroke-width': 2, 'circle-stroke-color': 'rgba(223,255,250,.65)' } })
      map.addLayer({ id: 'nexus-selection-core', type: 'circle', source: 'nexus-selection', paint: { 'circle-color': '#effffc', 'circle-radius': 6, 'circle-opacity': 1, 'circle-stroke-width': 3, 'circle-stroke-color': '#173f3c' } })
      const selectableLayers = ['nexus-clusters', 'nexus-signal-hit', 'nexus-signal-points', 'nexus-area-fill', 'nexus-track-hit', 'nexus-life-taxa-hit', 'nexus-life-density', 'nexus-migration-hit']
      map.on('click', (event) => {
        const box: [[number, number], [number, number]] = [[event.point.x - 22, event.point.y - 22], [event.point.x + 22, event.point.y + 22]]
        const features = map.queryRenderedFeatures(box, { layers: selectableLayers })
        const feature = features.find((item) => item.layer.id === 'nexus-clusters')
        const clusterId = feature?.properties?.cluster_id
        if (feature && clusterId !== undefined && feature.geometry.type === 'Point') {
          const center = feature.geometry.coordinates as [number, number]
          const source = map.getSource('nexus-signals') as GeoJSONSource
          void Promise.all([source.getClusterExpansionZoom(clusterId), source.getClusterLeaves(clusterId, 24, 0)]).then(([zoom, leaves]) => {
            const clusteredSignals = leaves.flatMap((leaf) => {
              const id = leaf.properties?.id
              const signal = signalsRef.current.find((item) => item.id === id)
              return signal ? [signal] : []
            })
            if (clusteredSignals.length) onSelectSignalClusterRef.current?.(clusteredSignals, { latitude: center[1], longitude: center[0] })
            map.easeTo({ center, zoom: Math.min(zoom, map.getZoom() + 2), duration: 520 })
          })
          return
        }
        const signalIds = [...new Set(features.filter((item) => ['nexus-signals', 'nexus-areas', 'nexus-tracks'].includes(item.source)).map((item) => item.properties?.id).filter((id): id is string => typeof id === 'string'))]
        const matchingSignals = signalIds.flatMap((id) => { const signal = signalsRef.current.find((item) => item.id === id); return signal ? [signal] : [] })
        if (matchingSignals.length > 1) { onSelectSignalClusterRef.current?.(matchingSignals, { latitude: event.lngLat.lat, longitude: event.lngLat.lng }); return }
        if (matchingSignals[0]) { onSelectRef.current(matchingSignals[0]); return }
        const lifeFeature = features.find((item) => item.source === 'nexus-life-density')
        const lifeId = lifeFeature?.properties?.id
        if (typeof lifeId === 'string') {
          if (lifeFeature?.properties?.itemKind === 'taxon') {
            const taxon = lifeRef.current?.taxa.find((item) => item.id === lifeId)
            if (taxon) onSelectLifeRef.current?.(taxon)
          } else {
            const domain = lifeFeature?.properties?.domain === 'migration' ? 'migration' : 'life'
            const cell = domain === 'migration' ? migrationRef.current?.cells.find((item) => item.id === lifeId) : lifeRef.current?.cells.find((item) => item.id === lifeId)
            if (cell) onSelectEcologicalCellRef.current?.({ ...cell, domain })
          }
          return
        }
        const migrationId = features.find((item) => item.source === 'nexus-migration')?.properties?.id
        const corridor = typeof migrationId === 'string' ? migrationRef.current?.corridors.find((item) => item.id === migrationId) : undefined
        if (corridor) onSelectMigrationRef.current?.(corridor)
      })
      for (const layer of selectableLayers) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
      }
      setReady(true)
    })
    const commitView = () => {
      const center = map.getCenter()
      onViewChangeRef.current?.(clampGeographicView({ latitude: center.lat, longitude: center.lng, altitude: mapZoomToAltitude(map.getZoom()) }))
    }
    map.on('moveend', commitView)
    let resizeFrame = 0
    const resize = () => {
      window.cancelAnimationFrame(resizeFrame)
      resizeFrame = window.requestAnimationFrame(() => map.resize())
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(hostRef.current)
    window.visualViewport?.addEventListener('resize', resize, { passive: true })
    const canvas = map.getCanvas()
    const contextLostHandler = (event: Event) => { event.preventDefault(); setContextLost(true) }
    const contextRestoredHandler = () => { setContextLost(false); map.resize() }
    canvas.addEventListener('webglcontextlost', contextLostHandler)
    canvas.addEventListener('webglcontextrestored', contextRestoredHandler)
    map.on('error', (event) => {
      if (!settled && /style|source|worker|webgl/i.test(String(event.error?.message))) { settled = true; window.clearTimeout(timeout); onFallback() }
    })
    return () => {
      settled = true
      window.clearTimeout(timeout)
      window.cancelAnimationFrame(resizeFrame)
      resizeObserver.disconnect()
      window.visualViewport?.removeEventListener('resize', resize)
      canvas.removeEventListener('webglcontextlost', contextLostHandler)
      canvas.removeEventListener('webglcontextrestored', contextRestoredHandler)
      for (const state of Object.values(weatherLayerStates)) state.cleanup?.()
      for (const state of Object.values(weatherLayerStates)) { state.active = undefined; state.url = undefined; state.cleanup = undefined }
      // MapLibre can throw synchronously when a route change tears it down
      // before its remote style has finished loading. Navigation must never
      // take the whole application into Safe Mode because a basemap is slow.
      try { map.remove() } catch { /* Detached renderer is already unusable. */ }
      mapRef.current = null
    }
  }, [mapTheme, onFallback, performanceMode])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !active || !map?.getSource('nexus-signals')) return
    ;(map.getSource('nexus-signals') as GeoJSONSource).setData(collection)
  }, [active, collection, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !active || !map) return
    ;(map.getSource('nexus-areas') as GeoJSONSource | undefined)?.setData(areas)
    ;(map.getSource('nexus-tracks') as GeoJSONSource | undefined)?.setData(tracks)
  }, [active, areas, ready, tracks])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !active || !map) return
    ;(map.getSource('nexus-life-density') as GeoJSONSource | undefined)?.setData(ecologicalDensity)
    ;(map.getSource('nexus-migration') as GeoJSONSource | undefined)?.setData(migrationLines)
  }, [active, ecologicalDensity, migrationLines, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const historical = environmentalTime !== undefined && environmentalTime < Date.now() - 15 * 60_000
    const sync = (kind: WeatherKind, enabled: boolean, url: string, opacity: number, attribution: string) => {
      const state = weatherLayers.current[kind]
      if (!enabled) { clearWeatherLayer(map, kind, state); setWeatherStatus((current) => ({ ...current, [kind]: undefined })); return }
      if (!active) return
      if (state.url === url && state.active) return
      setWeatherStatus((current) => ({ ...current, [kind]: 'loading' }))
      const providerChanged = Boolean(state.url && new URL(state.url.replace('{bbox-epsg-3857}', '0,0,1,1').replace('{z}', '0').replace('{x}', '0').replace('{y}', '0')).hostname !== new URL(url.replace('{bbox-epsg-3857}', '0,0,1,1').replace('{z}', '0').replace('{x}', '0').replace('{y}', '0')).hostname)
      stageWeatherLayer(map, kind, url, opacity, attribution, state,
        () => { setLoadedAt((current) => ({ ...current, [kind]: Date.now() })); setWeatherStatus((current) => ({ ...current, [kind]: 'ready' })) },
        () => {
          if (providerChanged) clearWeatherLayer(map, kind, state)
          setWeatherStatus((current) => ({ ...current, [kind]: !providerChanged && loadedAt[kind] ? 'delayed' : 'unavailable' }))
        },
        kind === 'satellite' && historical ? 9 : undefined)
    }
    const satelliteUrl = historical ? nasaTrueColorTilesForDate(environmentalTime) : noaaGeoColorTileTemplate(environmentalFrameReference('satellite', layerReference))
    sync('satellite', satelliteEnabled, satelliteUrl, historical ? .64 : .4, historical ? 'Imagery: NASA EOSDIS GIBS / MODIS Terra' : environmentalLayers.satellite.attribution)
    sync('radar', radarEnabled && !historical, noaaRadarTileTemplate(environmentalFrameReference('radar', layerReference)), .76, environmentalLayers.radar.attribution)
  }, [active, environmentalTime, layerReference, loadedAt, radarEnabled, ready, satelliteEnabled])

  useEffect(() => {
    const location = focusLocation ?? selected?.location
    const map = mapRef.current
    if (!ready || !map) return
    ;(map.getSource('nexus-selection') as GeoJSONSource | undefined)?.setData(selectionCollection(location))
    if (!location) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    map.easeTo({ center: [location.longitude, location.latitude], zoom: Math.max(map.getZoom(), 3.8), duration: reduceMotion ? 0 : 480, essential: false })
  }, [focusLocation, ready, selected])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map?.getSource('nexus-signals')) return
    if (previousSelectedId.current) map.removeFeatureState({ source: 'nexus-signals', id: previousSelectedId.current }, 'selected')
    if (selected?.id) map.setFeatureState({ source: 'nexus-signals', id: selected.id }, { selected: true })
    previousSelectedId.current = selected?.id
  }, [ready, selected?.id])

  const historical = environmentalTime !== undefined && environmentalTime < Date.now() - 15 * 60_000
  const activeKind: WeatherKind | undefined = radarEnabled && !historical ? 'radar' : satelliteEnabled ? 'satellite' : undefined
  const successfulLoad = activeKind ? loadedAt[activeKind] : undefined
  const activeStatus = activeKind ? weatherStatus[activeKind] : undefined
  const currentLabel = radarEnabled && satelliteEnabled ? '2 WEATHER LAYERS' : radarEnabled ? 'NOAA RADAR · COVERAGE VARIES' : 'SATELLITE · GOES DOMAINS'
  const currentStatusCopy = activeStatus === 'unavailable' ? 'Imagery temporarily unavailable' : activeStatus === 'delayed' ? 'Showing the last successfully loaded image' : successfulLoad ? `Latest available · refreshed ${new Date(successfulLoad).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Acquiring latest imagery'
  const historicalStatusCopy = !satelliteEnabled ? 'Return to Now to view current radar' : activeStatus === 'unavailable' ? 'Daily satellite imagery unavailable' : activeStatus === 'delayed' ? 'Showing the last successfully loaded daily image' : successfulLoad ? `${new Date(environmentalTime!).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}${radarEnabled ? ' · radar history unavailable' : ''}` : 'Loading daily satellite context'
  return <div className="map-stage earth-scene-v2"><div ref={hostRef} className="maplibre-host" aria-label={`Interactive Earth showing ${collection.features.length} prioritized signals`}/>{(!ready || contextLost) && <div className="map-loading"><span/><strong>{contextLost ? 'Restoring Earth' : 'Awakening Earth'}</strong><small>{contextLost ? 'Graphics context was interrupted' : 'Loading geographic detail'}</small></div>}{(radarEnabled || satelliteEnabled) && <div className="connected-map-status"><span>{historical ? satelliteEnabled ? 'DAILY SATELLITE CONTEXT' : 'RADAR HISTORY UNAVAILABLE' : currentLabel}</span><small>{historical ? historicalStatusCopy : currentStatusCopy}</small></div>}</div>
}
