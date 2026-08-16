import { useEffect, useMemo, useRef, useState } from 'react'
import { CloudRain, Layers3, Satellite } from 'lucide-react'
import { AttributionControl, Map as MapLibreMap, NavigationControl, type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { geometryBounds, signalAreasGeoJSON, signalPointsGeoJSON } from '../lib/geospatial'
import { environmentalLayers, nasaTrueColorTiles, NOAA_RADAR_TILES, OPEN_FREE_MAP_STYLE } from '../lib/mapLayers'
import type { Signal } from '../types/signal'

interface Props {
  signals: Signal[]
  selected?: Signal
  onSelect(signal: Signal): void
}

const signalColor = ['match', ['get', 'type'],
  'earthquake', '#ffb35c', 'fire', '#ff755e', 'weather', '#74b7ff', 'aircraft', '#8ff5e8',
  'satellite', '#b9a4ff', 'space-weather', '#d6a4ff', 'media', '#f2da87', 'environment', '#74d9a1', '#c7d0d0',
]

export default function MapView({ signals, selected, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const onSelectRef = useRef(onSelect)
  const signalsRef = useRef(signals)
  const [ready, setReady] = useState(false)
  const [radar, setRadar] = useState(true)
  const [satellite, setSatellite] = useState(false)
  const [signalsVisible, setSignalsVisible] = useState(true)
  const [error, setError] = useState<string>()
  const points = useMemo(() => signalPointsGeoJSON(signals), [signals])
  const areas = useMemo(() => signalAreasGeoJSON(signals), [signals])
  signalsRef.current = signals
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let map: MapLibreMap
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: OPEN_FREE_MAP_STYLE,
        center: [8, 22],
        zoom: 1.35,
        minZoom: 0.8,
        maxZoom: 16,
        pitch: 0,
        bearing: 0,
        attributionControl: false,
        renderWorldCopies: true,
        maxPitch: 65,
        fadeDuration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220,
      })
    } catch {
      setError('The geographic renderer could not start on this device.')
      return
    }
    mapRef.current = map
    map.addControl(new NavigationControl({ visualizePitch: true, showZoom: true, showCompass: true }), 'bottom-right')
    map.addControl(new AttributionControl({ compact: true }), 'bottom-left')

    map.once('load', () => {
      const firstLabel = map.getStyle().layers?.find((layer: { type: string }) => layer.type === 'symbol')?.id
      map.addSource('nexus-satellite', { type: 'raster', tiles: [nasaTrueColorTiles()], tileSize: 256, maxzoom: 9, attribution: environmentalLayers.satellite.attribution })
      map.addLayer({ id: 'nexus-satellite', type: 'raster', source: 'nexus-satellite', layout: { visibility: 'none' }, paint: { 'raster-opacity': .74, 'raster-fade-duration': 260 } }, firstLabel)
      map.addSource('nexus-radar', { type: 'raster', tiles: [NOAA_RADAR_TILES], tileSize: 256, attribution: environmentalLayers.radar.attribution })
      map.addLayer({ id: 'nexus-radar', type: 'raster', source: 'nexus-radar', paint: { 'raster-opacity': .66, 'raster-fade-duration': 180 } }, firstLabel)
      map.addSource('nexus-areas', { type: 'geojson', data: signalAreasGeoJSON(signalsRef.current) })
      map.addLayer({ id: 'nexus-area-fill', type: 'fill', source: 'nexus-areas', paint: { 'fill-color': signalColor, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 1, .08, 7, .2] } })
      map.addLayer({ id: 'nexus-area-line', type: 'line', source: 'nexus-areas', paint: { 'line-color': signalColor, 'line-opacity': .82, 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1, 9, 2.5] } })
      map.addSource('nexus-points', { type: 'geojson', data: signalPointsGeoJSON(signalsRef.current), cluster: true, clusterMaxZoom: 8, clusterRadius: 54, clusterProperties: { maxSeverity: ['max', ['get', 'severity']] } })
      map.addLayer({ id: 'nexus-heat', type: 'heatmap', source: 'nexus-points', maxzoom: 4.5, paint: { 'heatmap-weight': ['interpolate', ['linear'], ['get', 'severity'], 0, .08, 100, 1], 'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, .35, 5, 1.05], 'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 8, 5, 28], 'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 2, .34, 5, 0] } })
      map.addLayer({ id: 'nexus-clusters', type: 'circle', source: 'nexus-points', filter: ['has', 'point_count'], paint: { 'circle-color': ['step', ['get', 'maxSeverity'], '#356e6b', 41, '#2f8993', 61, '#c48146', 81, '#c9574e'], 'circle-radius': ['step', ['get', 'point_count'], 11, 10, 15, 50, 20, 200, 25], 'circle-stroke-width': 1.5, 'circle-stroke-color': 'rgba(235,255,252,.72)', 'circle-opacity': .9 } })
      map.addLayer({ id: 'nexus-cluster-count', type: 'symbol', source: 'nexus-points', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 10 }, paint: { 'text-color': '#f4ffff' } })
      map.addLayer({ id: 'nexus-signals', type: 'circle', source: 'nexus-points', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': signalColor, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, ['interpolate', ['linear'], ['get', 'severity'], 0, 2.5, 100, 5], 10, ['interpolate', ['linear'], ['get', 'severity'], 0, 5, 100, 10]], 'circle-stroke-width': 1.2, 'circle-stroke-color': 'rgba(255,255,255,.84)', 'circle-opacity': ['match', ['get', 'freshness'], 'cached', .48, 'delayed', .62, .9] } })
      map.addLayer({ id: 'nexus-selected', type: 'circle', source: 'nexus-points', filter: ['==', ['get', 'id'], ''], paint: { 'circle-radius': 16, 'circle-color': 'rgba(143,245,232,.12)', 'circle-stroke-width': 2.5, 'circle-stroke-color': '#8ff5e8', 'circle-blur': .15 } })

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
        map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom, duration: 650 })
      })
      for (const layer of ['nexus-signals', 'nexus-clusters', 'nexus-area-fill']) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
      }
      setReady(true)
    })
    const resize = new ResizeObserver(() => map.resize())
    resize.observe(containerRef.current)
    return () => { resize.disconnect(); map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    ;(map.getSource('nexus-points') as GeoJSONSource | undefined)?.setData(points)
    ;(map.getSource('nexus-areas') as GeoJSONSource | undefined)?.setData(areas)
  }, [areas, points, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    for (const layer of ['nexus-heat', 'nexus-clusters', 'nexus-cluster-count', 'nexus-signals', 'nexus-selected', 'nexus-area-fill', 'nexus-area-line']) map.setLayoutProperty(layer, 'visibility', signalsVisible ? 'visible' : 'none')
    map.setLayoutProperty('nexus-radar', 'visibility', radar ? 'visible' : 'none')
    map.setLayoutProperty('nexus-satellite', 'visibility', satellite ? 'visible' : 'none')
  }, [radar, ready, satellite, signalsVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.setFilter('nexus-selected', ['==', ['get', 'id'], selected?.id ?? ''])
    if (!selected?.location) return
    const bounds = geometryBounds(selected.geometry)
    if (bounds && selected.geometry) map.fitBounds(bounds, { padding: 76, duration: 850, maxZoom: 8 })
    else map.easeTo({ center: [selected.location.longitude, selected.location.latitude], zoom: Math.max(map.getZoom(), 5.5), duration: 850 })
  }, [points.features, ready, selected])

  return <div className="map-stage">
    <div ref={containerRef} className="maplibre-host" role="application" aria-label={`Geographic world map showing ${points.features.length} located signals`}/>
    {!ready && !error && <div className="map-loading"><span/><strong>Resolving world geometry</strong></div>}
    {error && <div className="map-error"><strong>Map temporarily unavailable</strong><span>{error}</span></div>}
    <div className="map-layer-dock" role="group" aria-label="Environmental map overlays">
      <button className={radar ? 'active' : ''} aria-pressed={radar} onClick={() => setRadar((value) => !value)}><CloudRain/><span>Radar<small>NOAA · 5 min</small></span></button>
      <button className={satellite ? 'active' : ''} aria-pressed={satellite} onClick={() => setSatellite((value) => !value)}><Satellite/><span>Satellite<small>NASA · delayed</small></span></button>
      <button className={signalsVisible ? 'active' : ''} aria-pressed={signalsVisible} onClick={() => setSignalsVisible((value) => !value)}><Layers3/><span>Signals<small>{points.features.length} mapped</small></span></button>
    </div>
  </div>
}
