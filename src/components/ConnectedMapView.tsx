import { useEffect, useMemo, useRef, useState } from 'react'
import type { FeatureCollection, LineString, Point } from 'geojson'
import { Map as MapLibreMap, setWorkerUrl, type GeoJSONSource, type RasterTileSource } from 'maplibre-gl'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { environmentalLayerStamp, noaaGeoColorTileTemplate, noaaRadarTileTemplate } from '../lib/mapLayers'
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

function lifeDensity(migration?: MigrationSnapshot, life?: LifeGlobeSnapshot): FeatureCollection<Point, { id: string; observations: number; domain: 'migration' | 'life'; itemKind: 'cell' | 'taxon' }> {
  return { type: 'FeatureCollection', features: [
    ...(migration?.cells ?? []).map((cell) => ({ type: 'Feature' as const, properties: { id: cell.id, observations: cell.observations, domain: 'migration' as const, itemKind: 'cell' as const }, geometry: { type: 'Point' as const, coordinates: [cell.longitude, cell.latitude] } })),
    ...(life?.cells ?? []).map((cell) => ({ type: 'Feature' as const, properties: { id: cell.id, observations: cell.observations, domain: 'life' as const, itemKind: 'cell' as const }, geometry: { type: 'Point' as const, coordinates: [cell.longitude, cell.latitude] } })),
    ...(life?.taxa ?? []).map((taxon) => ({ type: 'Feature' as const, properties: { id: taxon.id, observations: taxon.observations, domain: 'life' as const, itemKind: 'taxon' as const }, geometry: { type: 'Point' as const, coordinates: [taxon.longitude, taxon.latitude] } })),
  ].sort((a, b) => b.properties.observations - a.properties.observations).slice(0, 500) }
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

export default function ConnectedMapView({ signals, selected, focusLocation, onSelect, onSelectSignalCluster, onSelectMigration, onSelectLife, onSelectEcologicalCell, radarEnabled = false, satelliteEnabled = false, mapTheme = 'dark', performanceMode = 'automatic', onFallback, initialView = DEFAULT_GEOGRAPHIC_VIEW, onViewChange, migration, life }: Props) {
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

  useEffect(() => { signalsRef.current = signals; onSelectRef.current = onSelect; onSelectSignalClusterRef.current = onSelectSignalCluster; onSelectMigrationRef.current = onSelectMigration; onSelectLifeRef.current = onSelectLife; onSelectEcologicalCellRef.current = onSelectEcologicalCell; migrationRef.current = migration; lifeRef.current = life; onViewChangeRef.current = onViewChange }, [life, migration, onSelect, onSelectEcologicalCell, onSelectLife, onSelectMigration, onSelectSignalCluster, onViewChange, signals])

  useEffect(() => {
    if (!hostRef.current) return
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
        'sky-color': '#02080d',
        'horizon-color': '#1b4651',
        'fog-color': '#07151c',
        'sky-horizon-blend': .42,
        'horizon-fog-blend': .72,
        'fog-ground-blend': .58,
      })
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
      // MapLibre can throw synchronously when a route change tears it down
      // before its remote style has finished loading. Navigation must never
      // take the whole application into Safe Mode because a basemap is slow.
      try { map.remove() } catch { /* Detached renderer is already unusable. */ }
      mapRef.current = null
    }
  }, [mapTheme, onFallback, performanceMode])

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
    const sync = (id: 'nexus-radar' | 'nexus-satellite', enabled: boolean, tiles: string[], opacity: number, attribution: string) => {
      if (!enabled) { removeWeatherSource(map, id); return }
      const source = map.getSource(id) as RasterTileSource | undefined
      if (source) source.setTiles(tiles)
      else addWeatherSource(map, id, tiles, opacity, attribution)
    }
    sync('nexus-satellite', satelliteEnabled, [noaaGeoColorTileTemplate(layerReference)], .4, 'Imagery: NOAA/NESDIS GeoColor')
    sync('nexus-radar', radarEnabled, [noaaRadarTileTemplate(layerReference)], .76, 'Radar: NOAA/NWS MRMS')
  }, [layerReference, radarEnabled, ready, satelliteEnabled])

  useEffect(() => {
    const location = focusLocation ?? selected?.location
    if (!location || !ready) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    mapRef.current?.easeTo({ center: [location.longitude, location.latitude], zoom: Math.max(mapRef.current.getZoom(), 3.8), duration: reduceMotion ? 0 : 480, essential: false })
  }, [focusLocation, ready, selected])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map?.getSource('nexus-signals')) return
    if (previousSelectedId.current) map.removeFeatureState({ source: 'nexus-signals', id: previousSelectedId.current }, 'selected')
    if (selected?.id) map.setFeatureState({ source: 'nexus-signals', id: selected.id }, { selected: true })
    previousSelectedId.current = selected?.id
  }, [ready, selected?.id])

  const radarStamp = environmentalLayerStamp('radar', layerReference)
  return <div className="map-stage earth-scene-v2"><div ref={hostRef} className="maplibre-host" aria-label={`Interactive Earth showing ${collection.features.length} prioritized signals`}/>{(!ready || contextLost) && <div className="map-loading"><span/><strong>{contextLost ? 'Restoring Earth' : 'Awakening Earth'}</strong><small>{contextLost ? 'Graphics context was interrupted' : 'Loading geographic detail'}</small></div>}<div className="connected-map-status"><span>{radarEnabled ? 'RADAR · U.S. COVERAGE' : satelliteEnabled ? 'CLOUDS · REGIONAL COVERAGE' : 'LIVING EARTH'}</span><small>{radarEnabled ? `Retrieved ${new Date(radarStamp.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : satelliteEnabled ? 'Recent GOES imagery where available' : 'Rotate · pinch · tap anything'}</small></div></div>
}
