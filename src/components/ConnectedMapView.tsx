import { useEffect, useMemo, useRef, useState } from 'react'
import type { FeatureCollection, Point } from 'geojson'
import { Map as MapLibreMap, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { environmentalFrameReference, environmentalLayers, fallbackMapStyle, nasaTrueColorTilesForDate, noaaGeoColorTileTemplate, noaaRadarTileTemplate } from '../lib/mapLayers'
import type { Signal } from '../types/signal'
import { altitudeToMapZoom, clampGeographicView, DEFAULT_GEOGRAPHIC_VIEW, mapZoomToAltitude, type GeographicView } from '../lib/geography'
import type { LifeGlobeSnapshot } from '../lib/lifeGlobe'
import { earthAreaCollection, earthForecastTracks, earthLifeCollection, earthPixelRatio, earthRenderPolicy, earthSignalCollection, semanticZoomBand, type EarthPerformanceMode, type SemanticZoomBand } from '../lib/earthRenderer'
import { focusOffsetForInspector, type InspectorLayout } from '../lib/interactionLayout'

setWorkerUrl(mapWorkerUrl)

interface Props {
  signals: Signal[]
  selected?: Signal
  focusLocation?: { latitude: number; longitude: number }
  focusOcclusion?: InspectorLayout
  onSelect(signal: Signal): void
  onSelectSignalCluster?(signals: Signal[], location: { latitude: number; longitude: number }, totalCount?: number): void
  onSelectLife?(taxon: LifeGlobeSnapshot['taxa'][number]): void
  onSelectEcologicalCell?(cell: LifeGlobeSnapshot['cells'][number]): void
  radarEnabled?: boolean
  satelliteEnabled?: boolean
  performanceMode?: EarthPerformanceMode
  onFallback(): void
  initialView?: GeographicView
  onViewChange?(view: GeographicView): void
  onRequestGlobe?(): void
  life?: LifeGlobeSnapshot
  active?: boolean
  environmentalTime?: number
}

function selectionCollection(location?: { latitude: number; longitude: number }): FeatureCollection<Point, Record<string, never>> {
  return {
    type: 'FeatureCollection',
    features: location ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [location.longitude, location.latitude] } }] : [],
  }
}

type WeatherKind = 'radar' | 'satellite'
type WeatherSlot = 'a' | 'b'
interface WeatherLayerState { active?: WeatherSlot; url?: string; cleanup?: () => void }

function firstSymbolLayer(map: MapLibreMap) {
  return map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id
}

function weatherLayerAnchor(map: MapLibreMap) {
  return map.getLayer('nexus-area-fill') ? 'nexus-area-fill' : firstSymbolLayer(map)
}

function weatherId(kind: WeatherKind, slot: WeatherSlot) { return `nexus-${kind}-${slot}` }

function orderWeatherLayers(map: MapLibreMap) {
  const anchor = weatherLayerAnchor(map)
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
  map.addLayer({ id: nextId, type: 'raster', source: nextId, paint: { 'raster-opacity': state.active ? 0 : opacity, 'raster-fade-duration': 350, 'raster-resampling': 'linear' } }, weatherLayerAnchor(map))
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
  }, map.getLayer('water') ? 'water' : map.getLayer('nexus-land-shadow') ? 'nexus-land-shadow' : firstSymbolLayer(map))
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

export default function ConnectedMapView({ signals, selected, focusLocation, focusOcclusion, onSelect, onSelectSignalCluster, onSelectLife, onSelectEcologicalCell, radarEnabled = false, satelliteEnabled = false, performanceMode = 'automatic', onFallback, initialView = DEFAULT_GEOGRAPHIC_VIEW, onViewChange, life, active = true, environmentalTime }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const onSelectRef = useRef(onSelect)
  const onSelectSignalClusterRef = useRef(onSelectSignalCluster)
  const onSelectLifeRef = useRef(onSelectLife)
  const onSelectEcologicalCellRef = useRef(onSelectEcologicalCell)
  const lifeRef = useRef(life)
  const onViewChangeRef = useRef(onViewChange)
  const initialViewRef = useRef(initialView)
  const initialPerformanceModeRef = useRef(performanceMode)
  const previousSelectedId = useRef<string | undefined>(undefined)
  const selectionEpoch = useRef(0)
  const signalsByIdRef = useRef(new Map(signals.map((signal) => [signal.id, signal])))
  const weatherLayers = useRef<Record<WeatherKind, WeatherLayerState>>({ radar: {}, satellite: {} })
  const [ready, setReady] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const [layerReference, setLayerReference] = useState(Date.now)
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden')
  const [zoomBand, setZoomBand] = useState<SemanticZoomBand>(() => semanticZoomBand(altitudeToMapZoom(initialView.altitude)))
  const zoomBandRef = useRef(zoomBand)
  const [loadedAt, setLoadedAt] = useState<Partial<Record<WeatherKind, number>>>({})
  const [weatherStatus, setWeatherStatus] = useState<Partial<Record<WeatherKind, 'loading' | 'ready' | 'delayed' | 'unavailable'>>>({})
  const rendererActive = active && pageVisible
  const policy = useMemo(() => earthRenderPolicy(performanceMode, zoomBand), [performanceMode, zoomBand])
  const collection = useMemo(() => earthSignalCollection(rendererActive ? signals : [], policy), [policy, rendererActive, signals])
  const areas = useMemo(() => earthAreaCollection(rendererActive ? signals : [], policy), [policy, rendererActive, signals])
  const tracks = useMemo(() => earthForecastTracks(rendererActive ? signals : [], policy), [policy, rendererActive, signals])
  const ecologicalDensity = useMemo(() => earthLifeCollection(rendererActive ? life : undefined, policy), [life, policy, rendererActive])
  const latestRenderData = useRef({ collection, areas, tracks, ecologicalDensity })
  latestRenderData.current = { collection, areas, tracks, ecologicalDensity }

  useEffect(() => {
    const syncVisibility = () => setPageVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', syncVisibility)
    return () => document.removeEventListener('visibilitychange', syncVisibility)
  }, [])

  useEffect(() => {
    if ((!radarEnabled && !satelliteEnabled) || !rendererActive) return
    const refresh = () => { if (document.visibilityState === 'visible') setLayerReference(Date.now()) }
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [radarEnabled, rendererActive, satelliteEnabled])

  useEffect(() => { signalsByIdRef.current = new Map(signals.map((signal) => [signal.id, signal])); onSelectRef.current = onSelect; onSelectSignalClusterRef.current = onSelectSignalCluster; onSelectLifeRef.current = onSelectLife; onSelectEcologicalCellRef.current = onSelectEcologicalCell; lifeRef.current = life; onViewChangeRef.current = onViewChange }, [life, onSelect, onSelectEcologicalCell, onSelectLife, onSelectSignalCluster, onViewChange, signals])

  useEffect(() => {
    if (!hostRef.current) return
    const weatherLayerStates = weatherLayers.current
    let settled = false
    const timeout = window.setTimeout(() => { if (!settled) onFallback() }, 4_000)
    const initial = clampGeographicView(initialViewRef.current)
    const map = new MapLibreMap({
      container: hostRef.current,
      style: fallbackMapStyle(import.meta.env.BASE_URL),
      center: [initial.longitude, initial.latitude], zoom: altitudeToMapZoom(initial.altitude), minZoom: 0, maxZoom: 16,
      pixelRatio: earthPixelRatio(initialPerformanceModeRef.current, window.devicePixelRatio || 1),
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
      const initialData = latestRenderData.current
      map.addSource('nexus-signals', {
        type: 'geojson', data: initialData.collection, cluster: true, clusterMaxZoom: 7, clusterRadius: 42,
        clusterProperties: {
          maxSeverity: ['max', ['get', 'severity']],
          thermalCount: ['+', ['get', 'thermal']],
          stormCount: ['+', ['get', 'storm']],
          newest: ['max', ['get', 'timestamp']],
        },
      })
      map.addSource('nexus-areas', { type: 'geojson', data: initialData.areas })
      map.addLayer({ id: 'nexus-area-fill', type: 'fill', source: 'nexus-areas', paint: { 'fill-color': '#74b7ff', 'fill-opacity': .13 } })
      map.addLayer({ id: 'nexus-area-outline', type: 'line', source: 'nexus-areas', paint: { 'line-color': '#9ad2ff', 'line-width': 1.4, 'line-opacity': .82 } })
      map.addSource('nexus-tracks', { type: 'geojson', data: initialData.tracks })
      map.addLayer({ id: 'nexus-track-hit', type: 'line', source: 'nexus-tracks', paint: { 'line-color': '#000000', 'line-width': 24, 'line-opacity': .001 } })
      map.addLayer({ id: 'nexus-track-lines', type: 'line', source: 'nexus-tracks', paint: { 'line-color': '#d7f0ff', 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': .9 } })
      map.addSource('nexus-life-density', { type: 'geojson', data: initialData.ecologicalDensity })
      map.addLayer({ id: 'nexus-life-density', type: 'circle', source: 'nexus-life-density', maxzoom: 5.5, filter: ['==', ['get', 'itemKind'], 'cell'], paint: { 'circle-color': '#69bfc0', 'circle-radius': ['interpolate', ['linear'], ['get', 'observations'], 10, 6, 30, 15], 'circle-opacity': ['interpolate', ['linear'], ['zoom'], 0, .14, 5.5, .3], 'circle-blur': .52 } })
      map.addLayer({ id: 'nexus-life-taxa', type: 'circle', source: 'nexus-life-density', minzoom: 4, filter: ['==', ['get', 'itemKind'], 'taxon'], paint: { 'circle-color': '#9bcf79', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 10, 8], 'circle-opacity': .82, 'circle-stroke-width': 1.2, 'circle-stroke-color': '#f4ffe9' } })
      map.addLayer({ id: 'nexus-life-taxa-hit', type: 'circle', source: 'nexus-life-density', minzoom: 4, filter: ['==', ['get', 'itemKind'], 'taxon'], paint: { 'circle-color': '#000000', 'circle-radius': 22, 'circle-opacity': .001 } })
      map.addLayer({ id: 'nexus-clusters', type: 'circle', source: 'nexus-signals', maxzoom: 7, filter: ['has', 'point_count'], paint: { 'circle-color': ['case', ['==', ['get', 'thermalCount'], ['get', 'point_count']], '#754a32', ['>', ['get', 'stormCount'], 0], '#315f7d', ['step', ['get', 'point_count'], '#315f5d', 25, '#367d77', 100, '#d08d55']], 'circle-radius': ['step', ['get', 'point_count'], 14, 25, 19, 100, 24], 'circle-stroke-width': 1.5, 'circle-stroke-color': '#bffff6', 'circle-opacity': .88 } })
      map.addLayer({ id: 'nexus-cluster-count', type: 'symbol', source: 'nexus-signals', maxzoom: 7, filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 10 }, paint: { 'text-color': '#efffff' } })
      map.addLayer({ id: 'nexus-signal-orbit-halo', type: 'circle', source: 'nexus-signals', maxzoom: 2, filter: ['all', ['!', ['has', 'point_count']], ['>=', ['get', 'severity'], 75]], paint: { 'circle-color': ['match', ['get', 'type'], 'earthquake', '#ffb35c', 'fire', '#ff755e', 'weather', '#74b7ff', 'aircraft', '#8ff5e8', 'satellite', '#b9a4ff', 'space-weather', '#d6a4ff', 'media', '#f2da87', 'environment', '#74d9a1', '#c7d0d0'], 'circle-radius': ['interpolate', ['linear'], ['get', 'severity'], 75, 8, 100, 14], 'circle-opacity': .14 } })
      map.addLayer({ id: 'nexus-signal-orbit-hit', type: 'circle', source: 'nexus-signals', maxzoom: 2, filter: ['all', ['!', ['has', 'point_count']], ['>=', ['get', 'severity'], 75]], paint: { 'circle-color': '#000000', 'circle-radius': 22, 'circle-opacity': .001 } })
      map.addLayer({ id: 'nexus-signal-orbit-points', type: 'circle', source: 'nexus-signals', maxzoom: 2, filter: ['all', ['!', ['has', 'point_count']], ['>=', ['get', 'severity'], 75]], paint: { 'circle-color': ['match', ['get', 'type'], 'earthquake', '#ffb35c', 'fire', '#ff755e', 'weather', '#74b7ff', 'aircraft', '#8ff5e8', 'satellite', '#b9a4ff', 'space-weather', '#d6a4ff', 'media', '#f2da87', 'environment', '#74d9a1', '#c7d0d0'], 'circle-radius': ['interpolate', ['linear'], ['get', 'severity'], 75, 4, 100, 7], 'circle-opacity': .88, 'circle-stroke-width': 1.25, 'circle-stroke-color': '#ecfffc' } })
      map.addLayer({ id: 'nexus-signal-continent-halo', type: 'circle', source: 'nexus-signals', minzoom: 2, maxzoom: 4, filter: ['all', ['!', ['has', 'point_count']], ['>=', ['get', 'severity'], 55]], paint: { 'circle-color': ['match', ['get', 'type'], 'earthquake', '#ffb35c', 'fire', '#ff755e', 'weather', '#74b7ff', 'aircraft', '#8ff5e8', 'satellite', '#b9a4ff', 'space-weather', '#d6a4ff', 'media', '#f2da87', 'environment', '#74d9a1', '#c7d0d0'], 'circle-radius': ['interpolate', ['linear'], ['get', 'severity'], 55, 7, 100, 15], 'circle-opacity': .14 } })
      map.addLayer({ id: 'nexus-signal-continent-hit', type: 'circle', source: 'nexus-signals', minzoom: 2, maxzoom: 4, filter: ['all', ['!', ['has', 'point_count']], ['>=', ['get', 'severity'], 55]], paint: { 'circle-color': '#000000', 'circle-radius': 22, 'circle-opacity': .001 } })
      map.addLayer({ id: 'nexus-signal-continent-points', type: 'circle', source: 'nexus-signals', minzoom: 2, maxzoom: 4, filter: ['all', ['!', ['has', 'point_count']], ['>=', ['get', 'severity'], 55]], paint: { 'circle-color': ['match', ['get', 'type'], 'earthquake', '#ffb35c', 'fire', '#ff755e', 'weather', '#74b7ff', 'aircraft', '#8ff5e8', 'satellite', '#b9a4ff', 'space-weather', '#d6a4ff', 'media', '#f2da87', 'environment', '#74d9a1', '#c7d0d0'], 'circle-radius': ['interpolate', ['linear'], ['get', 'severity'], 55, 3.5, 100, 7], 'circle-opacity': .84, 'circle-stroke-width': 1.25, 'circle-stroke-color': '#ecfffc' } })
      map.addLayer({ id: 'nexus-signal-halo', type: 'circle', source: 'nexus-signals', minzoom: 4, filter: ['!', ['has', 'point_count']], paint: { 'circle-color': ['match', ['get', 'type'], 'earthquake', '#ffb35c', 'fire', '#ff755e', 'weather', '#74b7ff', 'aircraft', '#8ff5e8', 'satellite', '#b9a4ff', 'space-weather', '#d6a4ff', 'media', '#f2da87', 'environment', '#74d9a1', '#c7d0d0'], 'circle-radius': ['interpolate', ['linear'], ['get', 'severity'], 0, 7, 100, 17], 'circle-opacity': .14 } })
      map.addLayer({ id: 'nexus-signal-hit', type: 'circle', source: 'nexus-signals', minzoom: 4, filter: ['!', ['has', 'point_count']], paint: { 'circle-color': '#000000', 'circle-radius': 22, 'circle-opacity': .001 } })
      map.addLayer({ id: 'nexus-signal-points', type: 'circle', source: 'nexus-signals', minzoom: 4, filter: ['!', ['has', 'point_count']], paint: { 'circle-color': ['match', ['get', 'type'], 'earthquake', '#ffb35c', 'fire', '#ff755e', 'weather', '#74b7ff', 'aircraft', '#8ff5e8', 'satellite', '#b9a4ff', 'space-weather', '#d6a4ff', 'media', '#f2da87', 'environment', '#74d9a1', '#c7d0d0'], 'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 11, ['interpolate', ['linear'], ['zoom'], 4, 4, 8, 7]], 'circle-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 1, .82], 'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1.25], 'circle-stroke-color': '#ecfffc' } })
      map.addSource('nexus-selection', { type: 'geojson', data: selectionCollection() })
      map.addLayer({ id: 'nexus-selection-halo', type: 'circle', source: 'nexus-selection', paint: { 'circle-color': '#dffffa', 'circle-radius': 22, 'circle-opacity': .16, 'circle-blur': .18, 'circle-stroke-width': 2, 'circle-stroke-color': 'rgba(223,255,250,.65)' } })
      map.addLayer({ id: 'nexus-selection-core', type: 'circle', source: 'nexus-selection', paint: { 'circle-color': '#effffc', 'circle-radius': 6, 'circle-opacity': 1, 'circle-stroke-width': 3, 'circle-stroke-color': '#173f3c' } })
      const selectableLayers = ['nexus-clusters', 'nexus-signal-orbit-hit', 'nexus-signal-orbit-points', 'nexus-signal-continent-hit', 'nexus-signal-continent-points', 'nexus-signal-hit', 'nexus-signal-points', 'nexus-area-fill', 'nexus-track-hit', 'nexus-life-taxa-hit', 'nexus-life-density']
      map.on('click', (event) => {
        const epoch = ++selectionEpoch.current
        const box: [[number, number], [number, number]] = [[event.point.x - 22, event.point.y - 22], [event.point.x + 22, event.point.y + 22]]
        const features = map.queryRenderedFeatures(box, { layers: selectableLayers })
        const feature = features.find((item) => item.layer.id === 'nexus-clusters')
        const clusterId = feature?.properties?.cluster_id
        if (feature && clusterId !== undefined && feature.geometry.type === 'Point') {
          const center = feature.geometry.coordinates as [number, number]
          const source = map.getSource('nexus-signals') as GeoJSONSource
          void Promise.all([source.getClusterExpansionZoom(clusterId), source.getClusterLeaves(clusterId, 24, 0)]).then(([zoom, leaves]) => {
            if (epoch !== selectionEpoch.current) return
            const clusteredSignals = leaves.flatMap((leaf) => {
              const id = leaf.properties?.id
              const signal = typeof id === 'string' ? signalsByIdRef.current.get(id) : undefined
              return signal ? [signal] : []
            })
            const totalCount = typeof feature.properties?.point_count === 'number' ? feature.properties.point_count : clusteredSignals.length
            if (clusteredSignals.length) onSelectSignalClusterRef.current?.(clusteredSignals, { latitude: center[1], longitude: center[0] }, totalCount)
            map.easeTo({ center, zoom: Math.min(zoom, map.getZoom() + 2), duration: 520 })
          }).catch(() => { /* A refreshed cluster source can invalidate a pending expansion safely. */ })
          return
        }
        const signalIds = [...new Set(features.filter((item) => ['nexus-signals', 'nexus-areas', 'nexus-tracks'].includes(item.source)).map((item) => item.properties?.id).filter((id): id is string => typeof id === 'string'))]
        const matchingSignals = signalIds.flatMap((id) => { const signal = signalsByIdRef.current.get(id); return signal ? [signal] : [] })
        if (matchingSignals.length > 1) { onSelectSignalClusterRef.current?.(matchingSignals, { latitude: event.lngLat.lat, longitude: event.lngLat.lng }); return }
        if (matchingSignals[0]) { onSelectRef.current(matchingSignals[0]); return }
        const lifeFeature = features.find((item) => item.source === 'nexus-life-density')
        const lifeId = lifeFeature?.properties?.id
        if (typeof lifeId === 'string') {
          if (lifeFeature?.properties?.itemKind === 'taxon') {
            const taxon = lifeRef.current?.taxa.find((item) => item.id === lifeId)
            if (taxon) onSelectLifeRef.current?.(taxon)
          } else {
            const cell = lifeRef.current?.cells.find((item) => item.id === lifeId)
            if (cell) onSelectEcologicalCellRef.current?.(cell)
          }
          return
        }
      })
      for (const layer of selectableLayers) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
      }
      setReady(true)
    })
    const commitView = () => {
      const center = map.getCenter()
      const nextBand = semanticZoomBand(map.getZoom())
      if (nextBand !== zoomBandRef.current) {
        zoomBandRef.current = nextBand
        setZoomBand(nextBand)
      }
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
    let contextRecoveryTimer: number | undefined
    const contextLostHandler = (event: Event) => {
      event.preventDefault()
      setContextLost(true)
      window.clearTimeout(contextRecoveryTimer)
      contextRecoveryTimer = window.setTimeout(onFallback, 4_000)
    }
    const contextRestoredHandler = () => { window.clearTimeout(contextRecoveryTimer); setContextLost(false); map.resize() }
    canvas.addEventListener('webglcontextlost', contextLostHandler)
    canvas.addEventListener('webglcontextrestored', contextRestoredHandler)
    map.on('error', (event) => {
      if (!settled && /style|source|worker|webgl/i.test(String(event.error?.message))) { settled = true; window.clearTimeout(timeout); onFallback() }
    })
    return () => {
      settled = true
      window.clearTimeout(timeout)
      window.clearTimeout(contextRecoveryTimer)
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
  }, [onFallback])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !rendererActive || !map?.getSource('nexus-signals')) return
    selectionEpoch.current += 1
    ;(map.getSource('nexus-signals') as GeoJSONSource).setData(collection)
  }, [collection, ready, rendererActive])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !rendererActive || !map) return
    ;(map.getSource('nexus-areas') as GeoJSONSource | undefined)?.setData(areas)
    ;(map.getSource('nexus-tracks') as GeoJSONSource | undefined)?.setData(tracks)
  }, [areas, ready, rendererActive, tracks])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !rendererActive || !map) return
    ;(map.getSource('nexus-life-density') as GeoJSONSource | undefined)?.setData(ecologicalDensity)
  }, [ecologicalDensity, ready, rendererActive])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    if (!rendererActive) {
      selectionEpoch.current += 1
      map.stop()
      for (const [kind, state] of Object.entries(weatherLayers.current) as Array<[WeatherKind, WeatherLayerState]>) clearWeatherLayer(map, kind, state)
      return
    }
    const frame = window.requestAnimationFrame(() => {
      map.resize()
      map.triggerRepaint()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [ready, rendererActive])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !rendererActive || !map) return
    const nextRatio = earthPixelRatio(performanceMode, window.devicePixelRatio || 1)
    if (Math.abs(map.getPixelRatio() - nextRatio) > .01) map.setPixelRatio(nextRatio)
  }, [performanceMode, ready, rendererActive])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const historical = environmentalTime !== undefined && environmentalTime < Date.now() - 15 * 60_000
    const sync = (kind: WeatherKind, enabled: boolean, url: string, opacity: number, attribution: string) => {
      const state = weatherLayers.current[kind]
      if (!enabled) { clearWeatherLayer(map, kind, state); setWeatherStatus((current) => ({ ...current, [kind]: undefined })); return }
      if (!rendererActive) return
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
  }, [environmentalTime, layerReference, loadedAt, radarEnabled, ready, rendererActive, satelliteEnabled])

  useEffect(() => {
    const location = focusLocation ?? selected?.location
    const map = mapRef.current
    if (!ready || !rendererActive || !map) return
    selectionEpoch.current += 1
    ;(map.getSource('nexus-selection') as GeoJSONSource | undefined)?.setData(selectionCollection(location))
    if (!location) return
    if (!focusOcclusion) return
    if (focusOcclusion?.detent === 'full') return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    map.stop()
    const container = map.getContainer().getBoundingClientRect()
    const offset = focusOffsetForInspector(focusOcclusion, { width: container.width || window.innerWidth, height: container.height || window.innerHeight })
    map.easeTo({ center: [location.longitude, location.latitude], zoom: Math.max(map.getZoom(), 3.8), offset, duration: reduceMotion ? 0 : 420, essential: false })
    // Primitive dependencies prevent harmless object replacement during a data refresh from replaying camera motion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusLocation?.latitude, focusLocation?.longitude, focusOcclusion?.detent, focusOcclusion?.mode, focusOcclusion?.visibleHeight, focusOcclusion?.visibleWidth, ready, rendererActive, selected?.id, selected?.location?.latitude, selected?.location?.longitude])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !rendererActive || !map?.getSource('nexus-signals')) return
    if (previousSelectedId.current) map.removeFeatureState({ source: 'nexus-signals', id: previousSelectedId.current }, 'selected')
    if (selected?.id) map.setFeatureState({ source: 'nexus-signals', id: selected.id }, { selected: true })
    previousSelectedId.current = selected?.id
  }, [ready, rendererActive, selected?.id])

  const historical = environmentalTime !== undefined && environmentalTime < Date.now() - 15 * 60_000
  const activeKind: WeatherKind | undefined = radarEnabled && !historical ? 'radar' : satelliteEnabled ? 'satellite' : undefined
  const successfulLoad = activeKind ? loadedAt[activeKind] : undefined
  const activeStatus = activeKind ? weatherStatus[activeKind] : undefined
  const currentLabel = radarEnabled && satelliteEnabled ? '2 WEATHER LAYERS' : radarEnabled ? 'NOAA RADAR · COVERAGE VARIES' : 'SATELLITE · GOES DOMAINS'
  const currentStatusCopy = activeStatus === 'unavailable' ? 'Imagery temporarily unavailable' : activeStatus === 'delayed' ? 'Showing the last successfully loaded image' : successfulLoad ? `Latest available · refreshed ${new Date(successfulLoad).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Acquiring latest imagery'
  const historicalStatusCopy = !satelliteEnabled ? 'Return to Now to view current radar' : activeStatus === 'unavailable' ? 'Daily satellite imagery unavailable' : activeStatus === 'delayed' ? 'Showing the last successfully loaded daily image' : successfulLoad ? `${new Date(environmentalTime!).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}${radarEnabled ? ' · radar history unavailable' : ''}` : 'Loading daily satellite context'
  return <div className="map-stage earth-scene-v2"><div ref={hostRef} className="maplibre-host" aria-label={`Interactive Earth showing ${collection.features.length} prioritized signals`}/>{(!ready || contextLost) && <div className="map-loading"><span/><strong>{contextLost ? 'Restoring Earth' : 'Awakening Earth'}</strong><small>{contextLost ? 'Graphics context was interrupted' : 'Loading geographic detail'}</small></div>}{(radarEnabled || satelliteEnabled) && <div className="connected-map-status"><span>{historical ? satelliteEnabled ? 'DAILY SATELLITE CONTEXT' : 'RADAR HISTORY UNAVAILABLE' : currentLabel}</span><small>{historical ? historicalStatusCopy : currentStatusCopy}</small></div>}</div>
}
