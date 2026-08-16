import { LocateFixed, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import { ATLAS_HEIGHT as HEIGHT, ATLAS_WIDTH as WIDTH, atlasGeometryPath, atlasProject, prioritizeAtlasSignals } from '../lib/atlas'
import { sanitizeAreaGeometry } from '../lib/geospatial'
import { noaaGeoColorImage, noaaRadarImage } from '../lib/mapLayers'
import type { Signal } from '../types/signal'
import ConnectedMapView from './ConnectedMapView'

interface Props {
  signals: Signal[]
  selected?: Signal
  onSelect(signal: Signal): void
  radarEnabled?: boolean
  satelliteEnabled?: boolean
  mapTheme?: 'dark' | 'street'
}

type WorldFeature = Feature<Polygon | MultiPolygon>

interface Camera { scale: number; x: number; y: number }

const initialCamera: Camera = { scale: 1, x: 0, y: 0 }

const colors: Record<Signal['type'], string> = {
  earthquake: '#ffb35c', fire: '#ff755e', weather: '#74b7ff', aircraft: '#8ff5e8', satellite: '#b9a4ff',
  'space-weather': '#d6a4ff', media: '#f2da87', environment: '#74d9a1', infrastructure: '#c7d0d0',
}

function AtlasMapView({ signals, selected, onSelect, radarEnabled = false, satelliteEnabled = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ distance?: number; camera: Camera }>({ camera: initialCamera })
  const [world, setWorld] = useState<WorldFeature[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [camera, setCamera] = useState<Camera>(initialCamera)
  const [radarStatus, setRadarStatus] = useState<'loading' | 'live' | 'error'>('loading')
  const [satelliteStatus, setSatelliteStatus] = useState<'loading' | 'live' | 'error'>('loading')
  const radarUrl = useMemo(() => noaaRadarImage(), [])
  const satelliteUrl = useMemo(() => noaaGeoColorImage(), [])
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
    if (!selected?.location) return
    const [pointX, pointY] = atlasProject(selected.location.longitude, selected.location.latitude)
    const scale = 2.8
    setCamera({ scale, x: WIDTH / 2 - pointX * scale, y: HEIGHT / 2 - pointY * scale })
  }, [selected])

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
        {satelliteEnabled && <image className="atlas-satellite" href={satelliteUrl} x="0" y="0" width={WIDTH} height={HEIGHT} preserveAspectRatio="none" onLoad={() => setSatelliteStatus('live')} onError={() => setSatelliteStatus('error')}/>} 
        {radarEnabled && <image className="atlas-radar" href={radarUrl} x="0" y="0" width={WIDTH} height={HEIGHT} preserveAspectRatio="none" onLoad={() => setRadarStatus('live')} onError={() => setRadarStatus('error')}/>} 
        <g className="atlas-areas">{areas.map(({ signal, path }) => <path key={signal.id} d={path} fill={colors[signal.type]} stroke={colors[signal.type]} onClick={(event) => { event.stopPropagation(); onSelect(signal) }}><title>{signal.title}</title></path>)}</g>
        <g className="atlas-signals">{points.map((signal) => { const [cx, cy] = atlasProject(signal.location!.longitude, signal.location!.latitude); const isSelected = signal.id === selected?.id; const radius = (isSelected ? 7 : 2.8 + (signal.severity ?? 20) / 42) / Math.sqrt(camera.scale); return <g key={signal.id} className={isSelected ? 'selected' : ''} onClick={(event) => { event.stopPropagation(); onSelect(signal) }}><circle className="signal-halo" cx={cx} cy={cy} r={radius * 2.5} fill={colors[signal.type]}/><circle className="signal-core" cx={cx} cy={cy} r={radius} fill={colors[signal.type]} stroke="#efffff" strokeWidth={.7 / camera.scale}><title>{signal.title}</title></circle>{isSelected && <text x={cx + radius * 1.5} y={cy - radius * 1.5} fontSize={10 / camera.scale}>{signal.title}</text>}</g> })}</g>
      </g>
    </svg>
    {!world.length && !loadFailed && <div className="map-loading"><span/><strong>Loading onboard geography</strong></div>}
    {loadFailed && <div className="map-error"><strong>Onboard geography unavailable</strong><span>Signals remain available in Discover and Observer.</span></div>}
    <div className="atlas-status"><span>{radarEnabled ? radarStatus === 'live' ? 'NOAA RADAR · LIVE' : radarStatus === 'error' ? 'RADAR UNAVAILABLE' : 'ACQUIRING RADAR' : satelliteEnabled ? satelliteStatus === 'live' ? 'NOAA GEOCOLOR · LATEST' : satelliteStatus === 'error' ? 'SATELLITE UNAVAILABLE' : 'ACQUIRING SATELLITE' : 'ONBOARD ATLAS'}</span><small>{radarEnabled ? 'MRMS · 5 min · US domains' : satelliteEnabled ? 'GOES East/West · 10–15 min' : `${points.length} prioritized · ${signals.length} available`}</small></div>
    <div className="atlas-controls" role="group" aria-label="Map controls"><button onClick={(event) => { event.stopPropagation(); zoom(1.55) }} aria-label="Zoom in"><Plus/></button><button onClick={(event) => { event.stopPropagation(); zoom(1 / 1.55) }} aria-label="Zoom out"><Minus/></button><button onClick={(event) => { event.stopPropagation(); setCamera(initialCamera) }} aria-label="Show whole world"><LocateFixed/></button></div>
  </div>
}

export default function MapView(props: Props) {
  const [mode, setMode] = useState<'detail' | 'atlas'>(() => navigator.onLine ? 'detail' : 'atlas')
  const fallback = useCallback(() => setMode('atlas'), [])
  return <>
    {mode === 'detail' ? <ConnectedMapView key={props.mapTheme ?? 'dark'} {...props} onFallback={fallback}/> : <AtlasMapView {...props}/>} 
    <div className="map-mode-switch" role="group" aria-label="Map detail mode">
      <button className={mode === 'detail' ? 'active' : ''} onClick={() => setMode('detail')}><strong>DETAIL</strong><small>connected</small></button>
      <button className={mode === 'atlas' ? 'active' : ''} onClick={() => setMode('atlas')}><strong>ATLAS</strong><small>offline</small></button>
    </div>
  </>
}
