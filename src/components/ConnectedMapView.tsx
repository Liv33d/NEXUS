import { useEffect, useMemo, useRef, useState } from 'react'
import type { FeatureCollection, LineString, Point } from 'geojson'
import { Map as MapLibreMap, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { environmentalLayerStamp, noaaGeoColorTileTemplate, noaaRadarTileTemplate } from '../lib/mapLayers'
import { signalAreasGeoJSON } from '../lib/geospatial'
import type { Signal } from '../types/signal'
import { altitudeToMapZoom, clampGeographicView, DEFAULT_GEOGRAPHIC_VIEW, mapZoomToAltitude, shouldReturnToGlobe, type GeographicView } from '../lib/geography'
import type { MigrationSnapshot } from '../lib/migration'
import type { LifeGlobeSnapshot } from '../lib/lifeGlobe'

setWorkerUrl(mapWorkerUrl)

interface Props {
  signals: Signal[]
  selected?: Signal
  onSelect(signal: Signal): void
  radarEnabled?: boolean
  satelliteEnabled?: boolean
  mapTheme?: 'dark' | 'street'
  onFallback(): void
  initialView?: GeographicView
  onViewChange?(view: GeographicView): void
  onRequestGlobe?(): void
  migration?: MigrationSnapshot
  life?: LifeGlobeSnapshot
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

function lifeDensity(migration?: MigrationSnapshot, life?: LifeGlobeSnapshot): FeatureCollection<Point, { observations: number; domain: 'migration' | 'life' }> {
  return { type: 'FeatureCollection', features: [
    ...(migration?.cells ?? []).map((cell) => ({ type: 'Feature' as const, properties: { observations: cell.observations, domain: 'migration' as const }, geometry: { type: 'Point' as const, coordinates: [cell.longitude, cell.latitude] } })),
    ...(life?.cells ?? []).map((cell) => ({ type: 'Feature' as const, properties: { observations: cell.observations, domain: 'life' as const }, geometry: { type: 'Point' as const, coordinates: [cell.longitude, cell.latitude] } })),
  ].slice(0, 500) }
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

export default function ConnectedMapView({ signals, selected, onSelect, radarEnabled = false, satelliteEnabled = false, mapTheme = 'dark', onFallback, initialView = DEFAULT_GEOGRAPHIC_VIEW, onViewChange, onRequestGlobe, migration, life }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const signalsRef = useRef(signals)
  const onSelectRef = useRef(onSelect)
  const onViewChangeRef = useRef(onViewChange)
  const onRequestGlobeRef = useRef(onRequestGlobe)
  const initialViewRef = useRef(initialView)
  const [ready, setReady] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const [layerReference, setLayerReference] = useState(Date.now)
  const collection = useMemo(() => signalCollection(signals), [signals])
  const areas = useMemo(() => signalAreasGeoJSON(signals), [signals])
  const tracks = useMemo(() => forecastTracks(signals), [signals])
  const migrationLines = useMemo(() => migrationTracks(migration), [migration])
  const ecologicalDensity = useMemo(() => lifeDensity(migration, life), [life, migration])

  useEffect(() => {
    if (!radarEnabled && !satelliteEnabled) return
    const refresh = () => { if (document.visibilityState === 'visible') setLayerReference(Date.now()) }
    refresh()
    const timer = window.setInterval(refresh, 5 * 60_000)
    return () => window.clearInterval(timer)
  }, [radarEnabled, satelliteEnabled])

  useEffect(() => { signalsRef.current = signals; onSelectRef.current = onSelect; onViewChangeRef.current = onViewChange; onRequestGlobeRef.current = onRequestGlobe }, [onRequestGlobe, onSelect, onViewChange, signals])

  useEffect(() => {
    if (!hostRef.current) return
    let settled = false
    const timeout = window.setTimeout(() => { if (!settled) onFallback() }, 14_000)
    const initial = clampGeographicView(initialViewRef.current)
    const map = new MapLibreMap({
      container: hostRef.current,
      style: `https://tiles.openfreemap.org/styles/${mapTheme === 'street' ? 'liberty' : 'dark'}`,
      center: [initial.longitude, initial.latitude], zoom: altitudeToMapZoom(initial.altitude), minZoom: 0.75, maxZoom: 16,
      pitchWithRotate: false, dragRotate: false, touchPitch: false,
      attributionControl: {},
    })
    mapRef.current = map
    map.once('load', () => {
      settled = true
      window.clearTimeout(timeout)
      map.addSource('nexus-signals', { type: 'geojson', data: signalCollection(signalsRef.current), cluster: true, clusterMaxZoom: 7, clusterRadius: 42 })
      map.addSource('nexus-areas', { type: 'geojson', data: signalAreasGeoJSON(signalsRef.current) })
      map.addLayer({ id: 'nexus-area-fill', type: 'fill', source: 'nexus-areas', paint: { 'fill-color': '#74b7ff', 'fill-opacity': .13 } })
      map.addLayer({ id: 'nexus-area-outline', type: 'line', source: 'nexus-areas', paint: { 'line-color': '#9ad2ff', 'line-width': 1.4, 'line-opacity': .82 } })
      map.addSource('nexus-tracks', { type: 'geojson', data: forecastTracks(signalsRef.current) })
      map.addLayer({ id: 'nexus-track-lines', type: 'line', source: 'nexus-tracks', paint: { 'line-color': '#d7f0ff', 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': .9 } })
      map.addSource('nexus-life-density', { type: 'geojson', data: lifeDensity() })
      map.addLayer({ id: 'nexus-life-density', type: 'circle', source: 'nexus-life-density', paint: { 'circle-color': ['match', ['get', 'domain'], 'migration', '#a4ffcc', '#7edfd4'], 'circle-radius': ['interpolate', ['linear'], ['get', 'observations'], 1, 5, 30, 18], 'circle-opacity': .18, 'circle-blur': .45 } })
      map.addSource('nexus-migration', { type: 'geojson', data: migrationTracks() })
      map.addLayer({ id: 'nexus-migration', type: 'line', source: 'nexus-migration', paint: { 'line-color': '#a4ffcc', 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1.1, 8, 2.6], 'line-opacity': .62, 'line-dasharray': [2, 2] } })
      map.addLayer({ id: 'nexus-clusters', type: 'circle', source: 'nexus-signals', filter: ['has', 'point_count'], paint: { 'circle-color': ['step', ['get', 'point_count'], '#315f5d', 25, '#367d77', 100, '#d08d55'], 'circle-radius': ['step', ['get', 'point_count'], 15, 25, 20, 100, 27], 'circle-stroke-width': 1.5, 'circle-stroke-color': '#bffff6', 'circle-opacity': .88 } })
      map.addLayer({ id: 'nexus-cluster-count', type: 'symbol', source: 'nexus-signals', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 10 }, paint: { 'text-color': '#efffff' } })
      map.addLayer({ id: 'nexus-signal-halo', type: 'circle', source: 'nexus-signals', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': ['match', ['get', 'type'], 'earthquake', '#ffb35c', 'fire', '#ff755e', 'weather', '#74b7ff', 'aircraft', '#8ff5e8', 'satellite', '#b9a4ff', 'space-weather', '#d6a4ff', 'media', '#f2da87', 'environment', '#74d9a1', '#c7d0d0'], 'circle-radius': ['interpolate', ['linear'], ['get', 'severity'], 0, 7, 100, 17], 'circle-opacity': .14 } })
      map.addLayer({ id: 'nexus-signal-points', type: 'circle', source: 'nexus-signals', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': ['match', ['get', 'type'], 'earthquake', '#ffb35c', 'fire', '#ff755e', 'weather', '#74b7ff', 'aircraft', '#8ff5e8', 'satellite', '#b9a4ff', 'space-weather', '#d6a4ff', 'media', '#f2da87', 'environment', '#74d9a1', '#c7d0d0'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3.5, 8, 7], 'circle-stroke-width': 1.25, 'circle-stroke-color': '#ecfffc' } })
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
    const commitView = () => {
      const center = map.getCenter()
      onViewChangeRef.current?.(clampGeographicView({ latitude: center.lat, longitude: center.lng, altitude: mapZoomToAltitude(map.getZoom()) }))
      if (shouldReturnToGlobe(map.getZoom())) onRequestGlobeRef.current?.()
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
      // MapLibre can throw synchronously when a route change tears it down
      // before its remote style has finished loading. Navigation must never
      // take the whole application into Safe Mode because a basemap is slow.
      try { map.remove() } catch { /* Detached renderer is already unusable. */ }
      mapRef.current = null
    }
  }, [mapTheme, onFallback])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map?.getSource('nexus-signals')) return
    ;(map.getSource('nexus-signals') as GeoJSONSource).setData(collection)
  }, [collection, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    ;(map.getSource('nexus-areas') as GeoJSONSource | undefined)?.setData(areas)
    ;(map.getSource('nexus-tracks') as GeoJSONSource | undefined)?.setData(tracks)
  }, [areas, ready, tracks])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    ;(map.getSource('nexus-life-density') as GeoJSONSource | undefined)?.setData(ecologicalDensity)
    ;(map.getSource('nexus-migration') as GeoJSONSource | undefined)?.setData(migrationLines)
  }, [ecologicalDensity, migrationLines, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    removeWeatherSource(map, 'nexus-radar')
    removeWeatherSource(map, 'nexus-satellite')
    if (satelliteEnabled) addWeatherSource(map, 'nexus-satellite', [noaaGeoColorTileTemplate(layerReference)], .4, 'Imagery: NOAA/NESDIS GeoColor')
    if (radarEnabled) addWeatherSource(map, 'nexus-radar', [noaaRadarTileTemplate(layerReference)], .76, 'Radar: NOAA/NWS MRMS')
  }, [layerReference, radarEnabled, ready, satelliteEnabled])

  useEffect(() => {
    if (!selected?.location || !ready) return
    mapRef.current?.flyTo({ center: [selected.location.longitude, selected.location.latitude], zoom: Math.max(mapRef.current.getZoom(), 5), duration: 1300, essential: true })
  }, [ready, selected])

  const radarStamp = environmentalLayerStamp('radar', layerReference)
  return <div className="map-stage"><div ref={hostRef} className="maplibre-host" aria-label={`Detailed interactive map showing ${collection.features.length} signals`}/>{(!ready || contextLost) && <div className="map-loading"><span/><strong>{contextLost ? 'Restoring detailed map' : 'Acquiring detailed map'}</strong><small>{contextLost ? 'Graphics context was interrupted' : 'OpenFreeMap · no account or key'}</small></div>}<div className="connected-map-status"><span>{radarEnabled ? 'NOAA MRMS RADAR · US DOMAINS' : satelliteEnabled ? 'NOAA GEOCOLOR · OBSERVED' : 'DETAILED MAP · LIVE'}</span><small>{radarEnabled ? `Retrieved ${new Date(radarStamp.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · service not time-enabled` : satelliteEnabled ? 'Latest GOES East/West · regional coverage' : 'OpenStreetMap · OpenFreeMap'}</small></div></div>
}
