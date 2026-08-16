import { useEffect, useMemo, useRef, useState } from 'react'
import { CloudRain, Layers3, Pause, Play } from 'lucide-react'
import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type RasterTileSource,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { geometryBounds, signalAreasGeoJSON, signalPointsGeoJSON } from '../lib/geospatial'
import {
  fallbackMapStyle,
  noaaRadarTiles,
  radarFrames,
  worldGridGeoJSON,
} from '../lib/mapLayers'
import type { Signal } from '../types/signal'

interface Props {
  signals: Signal[]
  selected?: Signal
  onSelect(signal: Signal): void
}

export default function MapView({ signals, selected, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const onSelectRef = useRef(onSelect)
  const signalsRef = useRef(signals)
  const layerStateRef = useRef({ radar: false, signals: true, radarFrame: 0 })
  const [ready, setReady] = useState(false)
  const [radar, setRadar] = useState(false)
  const [radarPlaying, setRadarPlaying] = useState(false)
  const frames = useMemo(() => radarFrames(), [])
  const reduceMotion = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const [radarFrame, setRadarFrame] = useState(frames.length - 1)
  const [signalsVisible, setSignalsVisible] = useState(true)
  const [rendererError, setRendererError] = useState<string>()
  const points = useMemo(() => signalPointsGeoJSON(signals), [signals])
  const areas = useMemo(() => signalAreasGeoJSON(signals), [signals])
  signalsRef.current = signals
  onSelectRef.current = onSelect
  layerStateRef.current = { radar, signals: signalsVisible, radarFrame }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let map: MapLibreMap
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: fallbackMapStyle(import.meta.env.BASE_URL),
        center: [0, 12],
        zoom: 0.45,
        minZoom: 0.2,
        maxZoom: 16,
        pitch: 0,
        bearing: 0,
        attributionControl: false,
        renderWorldCopies: false,
        maxPitch: 65,
        fadeDuration: reduceMotion ? 0 : 220,
        cancelPendingTileRequestsWhileZooming: true,
      })
    } catch {
      setRendererError('The geographic renderer could not start on this device.')
      return
    }
    mapRef.current = map
    map.addControl(new NavigationControl({ visualizePitch: true, showZoom: true, showCompass: true }), 'bottom-right')
    map.addControl(new AttributionControl({ compact: true }), 'bottom-left')

    const installNexusLayers = () => {
      const state = layerStateRef.current
      const firstLabel = map.getStyle().layers?.find((layer: { type: string }) => layer.type === 'symbol')?.id
      if (!map.getSource('nexus-grid')) map.addSource('nexus-grid', { type: 'geojson', data: worldGridGeoJSON() })
      if (!map.getLayer('nexus-grid')) map.addLayer({ id: 'nexus-grid', type: 'line', source: 'nexus-grid', paint: { 'line-color': 'rgba(143,245,232,.16)', 'line-width': .55, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, .72, 6, .18] } }, firstLabel)
      if (!map.getSource('nexus-radar')) map.addSource('nexus-radar', { type: 'raster', tiles: [noaaRadarTiles(frames[state.radarFrame] ?? frames.at(-1))], tileSize: 256, attribution: 'Radar: NOAA/NWS MRMS' })
      if (!map.getLayer('nexus-radar')) map.addLayer({ id: 'nexus-radar', type: 'raster', source: 'nexus-radar', layout: { visibility: state.radar ? 'visible' : 'none' }, paint: { 'raster-opacity': .66, 'raster-fade-duration': 180 } }, firstLabel)
      if (!map.getSource('nexus-areas')) map.addSource('nexus-areas', { type: 'geojson', data: signalAreasGeoJSON(signalsRef.current) })
      if (!map.getLayer('nexus-area-fill')) map.addLayer({ id: 'nexus-area-fill', type: 'fill', source: 'nexus-areas', layout: { visibility: state.signals ? 'visible' : 'none' }, paint: { 'fill-color': ['match', ['get', 'type'], 'earthquake', '#ffb35c', 'fire', '#ff755e', 'weather', '#74b7ff', 'aircraft', '#8ff5e8', 'satellite', '#b9a4ff', 'space-weather', '#d6a4ff', 'media', '#f2da87', 'environment', '#74d9a1', '#c7d0d0'], 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 1, .08, 7, .2] } })
      if (!map.getLayer('nexus-area-line')) map.addLayer({ id: 'nexus-area-line', type: 'line', source: 'nexus-areas', layout: { visibility: state.signals ? 'visible' : 'none' }, paint: { 'line-color': ['match', ['get', 'type'], 'earthquake', '#ffb35c', 'fire', '#ff755e', 'weather', '#74b7ff', 'aircraft', '#8ff5e8', 'satellite', '#b9a4ff', 'space-weather', '#d6a4ff', 'media', '#f2da87', 'environment', '#74d9a1', '#c7d0d0'], 'line-opacity': .82, 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1, 9, 2.5] } })
      if (!map.getSource('nexus-points')) map.addSource('nexus-points', { type: 'geojson', data: signalPointsGeoJSON(signalsRef.current), cluster: true, clusterMaxZoom: 8, clusterRadius: 54, clusterProperties: { maxSeverity: ['max', ['get', 'severity']] } })
      const visibility = state.signals ? 'visible' : 'none'
      if (!map.getLayer('nexus-heat')) map.addLayer({ id: 'nexus-heat', type: 'heatmap', source: 'nexus-points', maxzoom: 4.5, layout: { visibility }, paint: { 'heatmap-weight': ['interpolate', ['linear'], ['get', 'severity'], 0, .08, 100, 1], 'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, .35, 5, 1.05], 'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 8, 5, 28], 'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 2, .34, 5, 0] } })
      if (!map.getLayer('nexus-clusters')) map.addLayer({ id: 'nexus-clusters', type: 'circle', source: 'nexus-points', filter: ['has', 'point_count'], layout: { visibility }, paint: { 'circle-color': ['step', ['get', 'maxSeverity'], '#356e6b', 41, '#2f8993', 61, '#c48146', 81, '#c9574e'], 'circle-radius': ['step', ['get', 'point_count'], 11, 10, 15, 50, 20, 200, 25], 'circle-stroke-width': 1.5, 'circle-stroke-color': 'rgba(235,255,252,.72)', 'circle-opacity': .9 } })
      if (!map.getLayer('nexus-cluster-count')) map.addLayer({ id: 'nexus-cluster-count', type: 'symbol', source: 'nexus-points', filter: ['has', 'point_count'], layout: { visibility, 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 10 }, paint: { 'text-color': '#f4ffff' } })
      if (!map.getLayer('nexus-signals')) map.addLayer({ id: 'nexus-signals', type: 'circle', source: 'nexus-points', filter: ['!', ['has', 'point_count']], layout: { visibility }, paint: { 'circle-color': ['match', ['get', 'type'], 'earthquake', '#ffb35c', 'fire', '#ff755e', 'weather', '#74b7ff', 'aircraft', '#8ff5e8', 'satellite', '#b9a4ff', 'space-weather', '#d6a4ff', 'media', '#f2da87', 'environment', '#74d9a1', '#c7d0d0'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, ['interpolate', ['linear'], ['get', 'severity'], 0, 2.5, 100, 5], 10, ['interpolate', ['linear'], ['get', 'severity'], 0, 5, 100, 10]], 'circle-stroke-width': 1.2, 'circle-stroke-color': 'rgba(255,255,255,.84)', 'circle-opacity': ['match', ['get', 'freshness'], 'cached', .48, 'delayed', .62, .9] } })
      if (!map.getLayer('nexus-selected')) map.addLayer({ id: 'nexus-selected', type: 'circle', source: 'nexus-points', filter: ['==', ['get', 'id'], ''], layout: { visibility }, paint: { 'circle-radius': 16, 'circle-color': 'rgba(143,245,232,.12)', 'circle-stroke-width': 2.5, 'circle-stroke-color': '#8ff5e8', 'circle-blur': .15 } })
      setReady(true)
      setRendererError(undefined)
    }

    map.on('style.load', installNexusLayers)
    map.on('click', 'nexus-signals', (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties.id as string | undefined
      const signal = signalsRef.current.find((candidate) => candidate.id === id)
      if (signal) onSelectRef.current(signal)
    })
    map.on('click', 'nexus-area-fill', (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties.id as string | undefined
      const signal = signalsRef.current.find((candidate) => candidate.id === id)
      if (signal) onSelectRef.current(signal)
    })
    map.on('click', 'nexus-clusters', async (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      if (!feature || feature.geometry.type !== 'Point') return
      const source = map.getSource('nexus-points') as GeoJSONSource
      const zoom = await source.getClusterExpansionZoom(Number(feature.properties.cluster_id))
      map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom, duration: reduceMotion ? 0 : 650 })
    })
    for (const layer of ['nexus-signals', 'nexus-clusters', 'nexus-area-fill']) {
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
    }
    const resize = new ResizeObserver(() => map.resize())
    resize.observe(containerRef.current)
    return () => {
      resize.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [frames, reduceMotion])

  useEffect(() => {
    if (!radar || !radarPlaying || reduceMotion) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setRadarFrame((frame) => (frame + 1) % frames.length)
    }, 1250)
    return () => window.clearInterval(timer)
  }, [frames.length, radar, radarPlaying, reduceMotion])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    ;(map.getSource('nexus-radar') as RasterTileSource | undefined)?.setTiles([noaaRadarTiles(frames[radarFrame])])
  }, [frames, radarFrame, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    ;(map.getSource('nexus-points') as GeoJSONSource | undefined)?.setData(points)
    ;(map.getSource('nexus-areas') as GeoJSONSource | undefined)?.setData(areas)
  }, [areas, points, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    for (const layer of ['nexus-heat', 'nexus-clusters', 'nexus-cluster-count', 'nexus-signals', 'nexus-selected', 'nexus-area-fill', 'nexus-area-line']) if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', signalsVisible ? 'visible' : 'none')
    if (map.getLayer('nexus-radar')) map.setLayoutProperty('nexus-radar', 'visibility', radar ? 'visible' : 'none')
  }, [radar, ready, signalsVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !map.getLayer('nexus-selected')) return
    map.setFilter('nexus-selected', ['==', ['get', 'id'], selected?.id ?? ''])
    if (!selected?.location) return
    const bounds = geometryBounds(selected.geometry)
    if (bounds && selected.geometry) map.fitBounds(bounds, { padding: 76, duration: reduceMotion ? 0 : 850, maxZoom: 8 })
    else map.easeTo({ center: [selected.location.longitude, selected.location.latitude], zoom: Math.max(map.getZoom(), 5.5), duration: reduceMotion ? 0 : 850 })
  }, [ready, reduceMotion, selected])

  return <div className="map-stage">
    <div ref={containerRef} className="maplibre-host" role="application" aria-label={`Geographic world map showing ${points.features.length} located signals`}/>
    {!ready && !rendererError && <div className="map-loading"><span/><strong>Resolving world geometry</strong></div>}
    {rendererError && <div className="map-error"><strong>Map renderer unavailable</strong><span>{rendererError}</span></div>}
    <div className="map-layer-dock" role="group" aria-label="Environmental map overlays">
      <button className={radar ? 'active' : ''} aria-pressed={radar} onClick={() => { setRadar((value) => !value); setRadarPlaying(false) }}><CloudRain/><span>Radar<small>{radarFrame === frames.length - 1 ? 'NOAA · latest' : `NOAA · −${(frames.length - radarFrame - 1) * 10} min`}</small></span></button>
      <button className={signalsVisible ? 'active' : ''} aria-pressed={signalsVisible} onClick={() => setSignalsVisible((value) => !value)}><Layers3/><span>Signals<small>{points.features.length} mapped</small></span></button>
    </div>
    {radar && <div className="radar-timeline" role="group" aria-label="NOAA radar history">
      <button disabled={reduceMotion} onClick={() => setRadarPlaying((value) => !value)} aria-label={reduceMotion ? 'Radar replay disabled by reduced motion preference; use the slider' : radarPlaying ? 'Pause radar replay' : 'Play radar replay'}>{radarPlaying ? <Pause/> : <Play/>}</button>
      <input type="range" min="0" max={frames.length - 1} value={radarFrame} onChange={(event) => { setRadarPlaying(false); setRadarFrame(Number(event.target.value)) }} aria-label="Radar observation time"/>
      <time>{radarFrame === frames.length - 1 ? 'LATEST' : new Date(frames[radarFrame]!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
    </div>}
  </div>
}
