import { useEffect, useMemo, useRef, useState } from 'react'
import type { FeatureCollection, Point } from 'geojson'
import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { noaaGeoColorTileTemplate, noaaRadarTileTemplate } from '../lib/mapLayers'
import type { Signal } from '../types/signal'

setWorkerUrl(mapWorkerUrl)

interface Props {
  signals: Signal[]
  selected?: Signal
  onSelect(signal: Signal): void
  radarEnabled?: boolean
  satelliteEnabled?: boolean
  onFallback(): void
}

type SignalProperties = { id: string; title: string; type: Signal['type']; severity: number }

const DETAIL_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const signalColors = ['match', ['get', 'type'], 'earthquake', '#ffb35c', 'fire', '#ff755e', 'weather', '#74b7ff', 'aircraft', '#8ff5e8', 'satellite', '#b9a4ff', 'space-weather', '#d6a4ff', 'media', '#f2da87', 'environment', '#74d9a1', '#c7d0d0'] as const

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

function addWeatherSource(map: MapLibreMap, id: 'nexus-radar' | 'nexus-satellite', tiles: string[], opacity: number, attribution?: string) {
  if (map.getSource(id)) return
  map.addSource(id, { type: 'raster', tiles, tileSize: 256, attribution: attribution ?? (id === 'nexus-radar' ? 'Weather: NOAA/NWS' : 'Satellite: NOAA/NESDIS') })
  map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': opacity, 'raster-fade-duration': 300 } }, map.getLayer('waterway-label') ? 'waterway-label' : undefined)
}

function removeWeatherSource(map: MapLibreMap, id: 'nexus-radar' | 'nexus-satellite') {
  if (map.getLayer(id)) map.removeLayer(id)
  if (map.getSource(id)) map.removeSource(id)
}

export default function ConnectedMapView({ signals, selected, onSelect, radarEnabled = false, satelliteEnabled = false, onFallback }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const signalsRef = useRef(signals)
  const onSelectRef = useRef(onSelect)
  const [ready, setReady] = useState(false)
  const [globalRadar, setGlobalRadar] = useState<{ tile: string; time: number }>()
  const collection = useMemo(() => signalCollection(signals), [signals])

  useEffect(() => { signalsRef.current = signals; onSelectRef.current = onSelect }, [onSelect, signals])

  useEffect(() => {
    if (!hostRef.current) return
    let settled = false
    const timeout = window.setTimeout(() => { if (!settled) onFallback() }, 14_000)
    const map = new MapLibreMap({
      container: hostRef.current,
      style: DETAIL_STYLE,
      center: [-20, 20], zoom: 1.35, minZoom: 0.75, maxZoom: 16,
      pitchWithRotate: false, dragRotate: false, touchPitch: false,
      attributionControl: {},
    })
    mapRef.current = map
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    map.once('load', () => {
      settled = true
      window.clearTimeout(timeout)
      map.addSource('nexus-signals', { type: 'geojson', data: signalCollection(signalsRef.current), cluster: true, clusterMaxZoom: 7, clusterRadius: 42 })
      map.addLayer({ id: 'nexus-clusters', type: 'circle', source: 'nexus-signals', filter: ['has', 'point_count'], paint: { 'circle-color': ['step', ['get', 'point_count'], '#315f5d', 25, '#367d77', 100, '#d08d55'], 'circle-radius': ['step', ['get', 'point_count'], 15, 25, 20, 100, 27], 'circle-stroke-width': 1.5, 'circle-stroke-color': '#bffff6', 'circle-opacity': .88 } })
      map.addLayer({ id: 'nexus-cluster-count', type: 'symbol', source: 'nexus-signals', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 10 }, paint: { 'text-color': '#efffff' } })
      map.addLayer({ id: 'nexus-signal-halo', type: 'circle', source: 'nexus-signals', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': signalColors, 'circle-radius': ['interpolate', ['linear'], ['get', 'severity'], 0, 7, 100, 17], 'circle-opacity': .14 } })
      map.addLayer({ id: 'nexus-signal-points', type: 'circle', source: 'nexus-signals', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': signalColors, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3.5, 8, 7], 'circle-stroke-width': 1.25, 'circle-stroke-color': '#ecfffc' } })
      map.on('click', 'nexus-signal-points', (event) => {
        const id = event.features?.[0]?.properties?.id
        const signal = signalsRef.current.find((item) => item.id === id)
        if (signal) onSelectRef.current(signal)
      })
      map.on('click', 'nexus-clusters', (event) => {
        const feature = event.features?.[0]
        const clusterId = feature?.properties?.cluster_id
        if (!feature || clusterId === undefined || feature.geometry.type !== 'Point') return
        const center = feature.geometry.coordinates as [number, number]
        void (map.getSource('nexus-signals') as GeoJSONSource).getClusterExpansionZoom(clusterId).then((zoom) => map.easeTo({ center, zoom }))
      })
      for (const layer of ['nexus-signal-points', 'nexus-clusters']) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
      }
      setReady(true)
    })
    map.on('error', (event) => {
      if (!settled && /style|source|worker|webgl/i.test(String(event.error?.message))) { settled = true; window.clearTimeout(timeout); onFallback() }
    })
    return () => { settled = true; window.clearTimeout(timeout); map.remove(); mapRef.current = null }
  }, [onFallback])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map?.getSource('nexus-signals')) return
    ;(map.getSource('nexus-signals') as GeoJSONSource).setData(collection)
  }, [collection, ready])

  useEffect(() => {
    if (!radarEnabled) return
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 8_000)
    void fetch('https://api.rainviewer.com/public/weather-maps.json', { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('Global radar unavailable'); return response.json() as Promise<unknown> })
      .then((value) => {
        if (!value || typeof value !== 'object') throw new Error('Invalid global radar index')
        const root = value as { host?: unknown; radar?: { past?: unknown } }
        const frames = Array.isArray(root.radar?.past) ? root.radar.past : []
        const latest = frames.at(-1) as { time?: unknown; path?: unknown } | undefined
        if (typeof root.host !== 'string' || !root.host.startsWith('https://') || typeof latest?.path !== 'string' || !latest.path.startsWith('/v2/radar/') || typeof latest.time !== 'number') throw new Error('Invalid global radar frame')
        setGlobalRadar({ tile: `${root.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`, time: latest.time * 1000 })
      })
      .catch(() => setGlobalRadar(undefined))
      .finally(() => window.clearTimeout(timeout))
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [radarEnabled])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    removeWeatherSource(map, 'nexus-radar')
    removeWeatherSource(map, 'nexus-satellite')
    if (satelliteEnabled) addWeatherSource(map, 'nexus-satellite', [noaaGeoColorTileTemplate()], .62)
    if (radarEnabled) addWeatherSource(map, 'nexus-radar', [globalRadar?.tile ?? noaaRadarTileTemplate()], .76, globalRadar ? 'Radar: RainViewer' : 'Radar: NOAA/NWS')
  }, [globalRadar, radarEnabled, ready, satelliteEnabled])

  useEffect(() => {
    if (!selected?.location || !ready) return
    mapRef.current?.flyTo({ center: [selected.location.longitude, selected.location.latitude], zoom: Math.max(mapRef.current.getZoom(), 5), duration: 1300, essential: true })
  }, [ready, selected])

  return <div className="map-stage"><div ref={hostRef} className="maplibre-host" aria-label={`Detailed interactive map showing ${collection.features.length} signals`}/>{!ready && <div className="map-loading"><span/><strong>Acquiring detailed map</strong><small>OpenFreeMap · no account or key</small></div>}<div className="connected-map-status"><span>{radarEnabled ? globalRadar ? 'GLOBAL RADAR · LIVE' : 'NOAA RADAR · LIVE' : satelliteEnabled ? 'SATELLITE · LATEST' : 'DETAILED MAP · LIVE'}</span><small>{radarEnabled && globalRadar ? `RainViewer · ${new Date(globalRadar.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'OpenStreetMap · OpenFreeMap'}</small></div></div>
}
