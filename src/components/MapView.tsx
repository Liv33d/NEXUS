import { LocateFixed, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import { ATLAS_HEIGHT as HEIGHT, ATLAS_WIDTH as WIDTH, atlasGeometryPath, atlasProject, prioritizeAtlasSignals } from '../lib/atlas'
import { sanitizeAreaGeometry } from '../lib/geospatial'
import { noaaRadarImage } from '../lib/mapLayers'
import type { Signal } from '../types/signal'
import type { GeographicView } from '../lib/geography'
import type { LifeGlobeSnapshot } from '../lib/lifeGlobe'
import { focusOffsetForInspector, type InspectorLayout } from '../lib/interactionLayout'

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
  performanceMode?: 'automatic' | 'quality' | 'battery'
  initialView?: GeographicView
  onViewChange?(view: GeographicView): void
  onRequestGlobe?(): void
  life?: LifeGlobeSnapshot
  active?: boolean
  environmentalTime?: number
  forceAtlas?: boolean
}

type WorldFeature = Feature<Polygon | MultiPolygon>

interface Camera { scale: number; x: number; y: number }

const initialCamera: Camera = { scale: 1, x: 0, y: 0 }

const colors: Record<Signal['type'], string> = {
  earthquake: '#ffb35c', fire: '#ff755e', weather: '#74b7ff', aircraft: '#8ff5e8', satellite: '#b9a4ff',
  'space-weather': '#d6a4ff', media: '#f2da87', environment: '#74d9a1', infrastructure: '#c7d0d0',
}

function AtlasMapView({ signals, selected, focusLocation, focusOcclusion, onSelect, onSelectLife, onSelectEcologicalCell, radarEnabled = false, satelliteEnabled = false, life, environmentalTime }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ distance?: number; camera: Camera }>({ camera: initialCamera })
  const [world, setWorld] = useState<WorldFeature[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [camera, setCamera] = useState<Camera>(initialCamera)
  const [radarStatus, setRadarStatus] = useState<'loading' | 'live' | 'error'>('loading')
  const [radarLoadedAt, setRadarLoadedAt] = useState<number>()
  const radarUrl = useMemo(() => noaaRadarImage(), [])
  const historical = environmentalTime !== undefined && environmentalTime < Date.now() - 15 * 60_000
  const areas = useMemo(() => signals.flatMap((signal) => {
    const geometry = sanitizeAreaGeometry(signal.geometry)
    return geometry ? [{ signal, path: atlasGeometryPath(geometry) }] : []
  }).slice(0, 180), [signals])
  const points = useMemo(() => prioritizeAtlasSignals(signals, camera.scale), [camera.scale, signals])

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`${import.meta.env.BASE_URL}natural-earth-110m-countries.geojson`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('World geometry unavailable')
        return response.json() as Promise<FeatureCollection>
      })
      .then((collection) => {
        const features = collection.features.filter((feature): feature is WorldFeature => feature.type === 'Feature' && (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon'))
        setWorld(features)
        setLoadFailed(false)
      })
      .catch(() => { if (!controller.signal.aborted) setLoadFailed(true) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const location = focusLocation ?? selected?.location
    const host = hostRef.current
    if (!location || !host || !focusOcclusion || focusOcclusion.detent === 'full') return
    const [pointX, pointY] = atlasProject(location.longitude, location.latitude)
    const scale = 2.8
    const rect = host.getBoundingClientRect()
    const [offsetX, offsetY] = focusOffsetForInspector(focusOcclusion, { width: rect.width, height: rect.height })
    const unitX = rect.width > 0 ? WIDTH / rect.width : 1
    const unitY = rect.height > 0 ? HEIGHT / rect.height : 1
    setCamera({ scale, x: WIDTH / 2 + offsetX * unitX - pointX * scale, y: HEIGHT / 2 + offsetY * unitY - pointY * scale })
    // Primitive dependencies prevent harmless object replacement during a data refresh from replaying camera motion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusLocation?.latitude, focusLocation?.longitude, focusOcclusion?.detent, focusOcclusion?.mode, focusOcclusion?.visibleHeight, focusOcclusion?.visibleWidth, selected?.id, selected?.location?.latitude, selected?.location?.longitude])

  const zoom = (factor: number) => setCamera((current) => {
    const scale = Math.max(1, Math.min(7, current.scale * factor))
    const centerX = (WIDTH / 2 - current.x) / current.scale
    const centerY = (HEIGHT / 2 - current.y) / current.scale
    return { scale, x: WIDTH / 2 - centerX * scale, y: HEIGHT / 2 - centerY * scale }
  })

  const onPointerDown = (event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    gesture.current = { camera }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      if (a && b) gesture.current.distance = Math.hypot(a.x - b.x, a.y - b.y)
    }
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    const rect = hostRef.current?.getBoundingClientRect()
    if (!rect) return
    const factor = WIDTH / rect.width
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 1) {
      setCamera((current) => ({ ...current, x: current.x + (event.clientX - previous.x) * factor, y: current.y + (event.clientY - previous.y) * factor }))
      return
    }
    const [a, b] = [...pointers.current.values()]
    if (!a || !b || !gesture.current.distance) return
    const nextDistance = Math.hypot(a.x - b.x, a.y - b.y)
    const nextScale = Math.max(1, Math.min(7, gesture.current.camera.scale * nextDistance / gesture.current.distance))
    setCamera((current) => {
      const centerX = (WIDTH / 2 - current.x) / current.scale
      const centerY = (HEIGHT / 2 - current.y) / current.scale
      return { scale: nextScale, x: WIDTH / 2 - centerX * nextScale, y: HEIGHT / 2 - centerY * nextScale }
    })
  }

  const releasePointer = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId)
    gesture.current = { camera }
  }

  return <div ref={hostRef} className="atlas-stage" role="application" aria-label={`Geographic world atlas showing ${points.length} prioritized signals`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={releasePointer} onPointerCancel={releasePointer}>
    <svg className="atlas-map" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><radialGradient id="atlas-ocean" cx="50%" cy="45%" r="72%"><stop offset="0" stopColor="#092023"/><stop offset=".55" stopColor="#031012"/><stop offset="1" stopColor="#010607"/></radialGradient></defs>
      <rect width={WIDTH} height={HEIGHT} fill="url(#atlas-ocean)"/>
      <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
        <g className="atlas-grid">{[-120,-60,0,60,120].map((longitude) => { const [x] = atlasProject(longitude, 0); return <line key={`lng-${longitude}`} x1={x} x2={x} y1="0" y2={HEIGHT}/> })}{[-60,-30,0,30,60].map((latitude) => { const [,y] = atlasProject(0, latitude); return <line key={`lat-${latitude}`} x1="0" x2={WIDTH} y1={y} y2={y}/> })}</g>
        <g className="atlas-land">{world.map((feature, index) => <path key={`${typeof feature.properties?.name === 'string' ? feature.properties.name : 'land'}-${index}`} d={atlasGeometryPath(feature.geometry)}/>)}</g>
        {radarEnabled && !historical && <image className="atlas-radar" href={radarUrl} x="0" y="0" width={WIDTH} height={HEIGHT} preserveAspectRatio="none" onLoad={() => { setRadarLoadedAt(Date.now()); setRadarStatus('live') }} onError={() => setRadarStatus('error')}/>}
        <g className="atlas-life-density">{(life?.cells ?? []).slice(0, 100).map((cell) => { const [cx, cy] = atlasProject(cell.longitude, cell.latitude); return <circle key={cell.id} cx={cx} cy={cy} r={(2.4 + Math.log2(cell.observations + 1)) / Math.sqrt(camera.scale)} onClick={(event) => { event.stopPropagation(); onSelectEcologicalCell?.(cell) }}><title>{cell.observations} coarse life observation records</title></circle> })}</g>
        <g className="atlas-life-taxa">{(life?.taxa ?? []).slice(0, 24).map((taxon) => { const [cx, cy] = atlasProject(taxon.longitude, taxon.latitude); return <circle key={taxon.id} cx={cx} cy={cy} r={4 / Math.sqrt(camera.scale)} onClick={(event) => { event.stopPropagation(); onSelectLife?.(taxon) }}><title>{taxon.commonName ?? taxon.scientificName}</title></circle> })}</g>
        <g className="atlas-areas">{areas.map(({ signal, path }) => <path key={signal.id} d={path} fill={colors[signal.type]} stroke={colors[signal.type]} onClick={(event) => { event.stopPropagation(); onSelect(signal) }}><title>{signal.title}</title></path>)}</g>
        <g className="atlas-signals">{points.map((signal) => { const [cx, cy] = atlasProject(signal.location!.longitude, signal.location!.latitude); const isSelected = signal.id === selected?.id; const radius = (isSelected ? 7 : 2.8 + (signal.severity ?? 20) / 42) / Math.sqrt(camera.scale); return <g key={signal.id} className={isSelected ? 'selected' : ''} onClick={(event) => { event.stopPropagation(); onSelect(signal) }}><circle className="signal-halo" cx={cx} cy={cy} r={radius * 2.5} fill={colors[signal.type]}/><circle className="signal-core" cx={cx} cy={cy} r={radius} fill={colors[signal.type]} stroke="#efffff" strokeWidth={.7 / camera.scale}><title>{signal.title}</title></circle>{isSelected && <text x={cx + radius * 1.5} y={cy - radius * 1.5} fontSize={10 / camera.scale}>{signal.title}</text>}</g> })}</g>
        {selected?.location && (() => { const [cx, cy] = atlasProject(selected.location.longitude, selected.location.latitude); return <g className="atlas-selection"><circle cx={cx} cy={cy} r={18 / Math.sqrt(camera.scale)}/><circle cx={cx} cy={cy} r={6 / Math.sqrt(camera.scale)}/></g> })()}
      </g>
    </svg>
    <aside className="atlas-access-list" aria-label="Visible Earth objects"><details><summary>Browse visible objects</summary><div>{points.slice(0, 12).map((signal) => <button key={signal.id} onClick={() => onSelect(signal)}><span className={`type-dot ${signal.type}`}/><span><strong>{signal.title}</strong><small>{signal.source.provider}</small></span></button>)}{(life?.taxa ?? []).slice(0, 6).map((taxon) => <button key={taxon.id} onClick={() => onSelectLife?.(taxon)}><span className="type-dot environment"/><span><strong>{taxon.commonName ?? taxon.scientificName}</strong><small>{taxon.observations} coarse records</small></span></button>)}</div></details></aside>
    {!world.length && !loadFailed && <div className="map-loading"><span/><strong>Loading onboard geography</strong></div>}
    {loadFailed && <div className="map-error"><strong>Onboard geography unavailable</strong><span>Current evidence remains available in Earth Today and Your Earth.</span></div>}
    <div className="atlas-status"><span>{historical && radarEnabled ? 'RADAR HISTORY UNAVAILABLE' : radarEnabled ? radarStatus === 'live' ? 'NOAA RADAR · LATEST AVAILABLE' : radarStatus === 'error' ? 'RADAR UNAVAILABLE' : 'ACQUIRING RADAR' : satelliteEnabled ? 'SATELLITE IMAGERY REQUIRES DETAIL MAP' : 'ONBOARD ATLAS'}</span><small>{historical && radarEnabled ? 'Return to Now to view current radar' : radarEnabled ? radarLoadedAt ? `Coverage varies · refreshed ${new Date(radarLoadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Coverage varies · waiting for imagery' : satelliteEnabled ? 'Offline atlas suppresses dynamic imagery' : `${points.length} prioritized · ${signals.length} available`}</small></div>
    <div className="atlas-controls" role="group" aria-label="Map controls"><button onClick={(event) => { event.stopPropagation(); zoom(1.55) }} aria-label="Zoom in"><Plus/></button><button onClick={(event) => { event.stopPropagation(); zoom(1 / 1.55) }} aria-label="Zoom out"><Minus/></button><button onClick={(event) => { event.stopPropagation(); setCamera(initialCamera) }} aria-label="Show whole world"><LocateFixed/></button></div>
  </div>
}

export default function MapView(props: Props) {
  const [mode, setMode] = useState<'detail' | 'atlas'>(() => props.forceAtlas || !navigator.onLine ? 'atlas' : 'detail')
  const [detailAttempt, setDetailAttempt] = useState(0)
  const [detailFailures, setDetailFailures] = useState(0)
  const [DetailMap, setDetailMap] = useState<ComponentType<Props & { onFallback(): void }> | null>(null)
  const fallback = useCallback(() => { setDetailFailures((failures) => failures + 1); setMode('atlas') }, [])
  useEffect(() => {
    if (mode !== 'detail' || props.forceAtlas || DetailMap) return
    let cancelled = false
    void import('./ConnectedMapView')
      .then((module) => { if (!cancelled) setDetailMap(() => module.default) })
      .catch(() => { if (!cancelled) fallback() })
    return () => { cancelled = true }
  }, [DetailMap, fallback, mode, props.forceAtlas])
  useEffect(() => {
    if (mode !== 'atlas' || props.forceAtlas) return
    const recover = () => { setDetailFailures(0); setDetailAttempt((attempt) => attempt + 1); setMode('detail') }
    window.addEventListener('online', recover)
    const retry = navigator.onLine && detailFailures === 1 ? window.setTimeout(() => { setDetailAttempt((attempt) => attempt + 1); setMode('detail') }, 20_000) : undefined
    return () => { window.removeEventListener('online', recover); if (retry !== undefined) window.clearTimeout(retry) }
  }, [detailFailures, mode, props.forceAtlas])
  return mode === 'detail' && !props.forceAtlas
    ? DetailMap
      ? <DetailMap key={detailAttempt} {...props} onFallback={fallback}/>
      : <div className="globe-loading"><span/><strong>Preparing detailed Earth</strong></div>
    : <AtlasMapView {...props}/>
}
