import { memo, useEffect, useMemo, useRef, useState } from 'react'
import Globe, { type GlobeMethods } from 'react-globe.gl'
import { Mesh, MeshBasicMaterial, ShaderMaterial, SphereGeometry, SRGBColorSpace, TextureLoader, Vector2 } from 'three'
import { environmentalLayerStamp, nasaObservedCloudImage, noaaRadarImage } from '../lib/mapLayers'
import { subsolarPoint } from '../lib/solar'
import { GLOBE_CITIES, type GlobeCity } from '../data/cities'
import type { Signal } from '../types/signal'
import type { Feature, MultiPolygon, Polygon } from 'geojson'
import { clampGeographicView, DEFAULT_GEOGRAPHIC_VIEW, geographicViewsDiffer, type GeographicView } from '../lib/geography'
import type { MigrationSnapshot } from '../lib/migration'

interface Props {
  signals: Signal[]
  selected?: Signal
  onSelect(signal: Signal): void
  onReady(): void
  batterySaver?: boolean
  radarEnabled?: boolean
  satelliteEnabled?: boolean
  lightingMode?: 'live' | 'day' | 'night'
  autoRotate?: boolean
  atmosphereEnabled?: boolean
  labelsEnabled?: boolean
  qualityMode?: 'automatic' | 'quality' | 'battery'
  initialView?: GeographicView
  onViewChange?(view: GeographicView): void
  onRequestSolar?(): void
  migration?: MigrationSnapshot
}

interface EarthLabel { name: string; lat: number; lng: number; kind: 'land' | 'water' | 'place'; population?: number; capital?: boolean }
interface GlobeViewpoint { lat: number; lng: number; altitude: number }
interface GlobeRing { id: string; lat: number; lng: number; color: string; maxRadius: number; repeatPeriod: number }

const WORLD_LABELS: EarthLabel[] = [
  { name: 'NORTH AMERICA', lat: 47, lng: -103, kind: 'land' }, { name: 'SOUTH AMERICA', lat: -18, lng: -59, kind: 'land' },
  { name: 'EUROPE', lat: 50, lng: 17, kind: 'land' }, { name: 'AFRICA', lat: 8, lng: 20, kind: 'land' },
  { name: 'ASIA', lat: 46, lng: 88, kind: 'land' }, { name: 'AUSTRALIA', lat: -25, lng: 134, kind: 'land' },
  { name: 'PACIFIC OCEAN', lat: 4, lng: -150, kind: 'water' }, { name: 'ATLANTIC OCEAN', lat: 18, lng: -35, kind: 'water' },
  { name: 'INDIAN OCEAN', lat: -22, lng: 80, kind: 'water' }, { name: 'ARCTIC OCEAN', lat: 74, lng: 20, kind: 'water' },
]

function angularDistance(a: Pick<GlobeViewpoint, 'lat' | 'lng'>, b: Pick<GlobeCity, 'lat' | 'lng'>): number {
  const radians = Math.PI / 180
  const lat1 = a.lat * radians
  const lat2 = b.lat * radians
  const delta = (a.lng - b.lng) * radians
  return Math.acos(Math.min(1, Math.max(-1, Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(delta)))) / radians
}

function cityLabelsForView(view: GlobeViewpoint): EarthLabel[] {
  if (view.altitude >= 1.35) return WORLD_LABELS
  const mapZoom = Math.max(1.5, 3.25 - Math.log2(Math.max(view.altitude, 0.08)))
  const radius = view.altitude < 0.28 ? 14 : view.altitude < 0.55 ? 28 : view.altitude < 0.9 ? 48 : 72
  const limit = view.altitude < 0.3 ? 44 : view.altitude < 0.65 ? 30 : 20
  return GLOBE_CITIES
    .map((city) => ({ city, distance: angularDistance(view, city) }))
    .filter(({ city, distance }) => distance <= radius && (city.minZoom <= mapZoom + 1.1 || city.capital || city.population >= 2_000_000))
    .sort((a, b) => (b.city.capital ? 1 : 0) - (a.city.capital ? 1 : 0) || b.city.population - a.city.population || a.distance - b.distance)
    .slice(0, limit)
    .map(({ city }) => ({ ...city, kind: 'place' as const }))
}

const typeColor: Record<Signal['type'], string> = {
  earthquake: '#ffb35c', fire: '#ff755e', weather: '#74b7ff', aircraft: '#8ff5e8', satellite: '#b9a4ff',
  'space-weather': '#d6a4ff', media: '#f2da87', environment: '#74d9a1', infrastructure: '#c7d0d0',
}

function createEarthMaterial() {
  const loader = new TextureLoader().setCrossOrigin('anonymous')
  const dayTexture = loader.load(`${import.meta.env.BASE_URL}earth-blue-marble.jpg`)
  const nightTexture = loader.load(`${import.meta.env.BASE_URL}earth-city-lights.jpg`)
  dayTexture.colorSpace = SRGBColorSpace
  nightTexture.colorSpace = SRGBColorSpace
  return new ShaderMaterial({
    uniforms: {
      dayTexture: { value: dayTexture }, nightTexture: { value: nightTexture },
      sunPosition: { value: new Vector2() }, lightingMode: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      #define PI 3.141592653589793
      uniform sampler2D dayTexture; uniform sampler2D nightTexture; uniform vec2 sunPosition; uniform float lightingMode;
      varying vec2 vUv;
      float rad(float value){return value*PI/180.0;}
      void main(){
        float surfaceLon=(vUv.x*2.0-1.0)*PI;float surfaceLat=(vUv.y-.5)*PI;
        float sunLon=rad(sunPosition.x);float sunLat=rad(sunPosition.y);
        float light=sin(surfaceLat)*sin(sunLat)+cos(surfaceLat)*cos(sunLat)*cos(surfaceLon-sunLon);
        float daylight=lightingMode>1.5?0.0:(lightingMode>.5?1.0:smoothstep(-.14,.16,light));
        vec4 day=texture2D(dayTexture,vUv);vec4 night=texture2D(nightTexture,vUv);
        vec3 dayWorld=pow(max(day.rgb,vec3(0.0)),vec3(.72))*1.22;
        dayWorld=mix(vec3(dot(dayWorld,vec3(.2126,.7152,.0722))),dayWorld,1.12);
        dayWorld=clamp(dayWorld,0.0,1.0);
        // Night remains a readable low-light Earth. Astronomical darkness should
        // communicate time—not erase geography on a phone display.
        vec3 nightTerrain=dayWorld*vec3(.31,.34,.42);
        vec3 cityLights=pow(max(night.rgb,vec3(0.0)),vec3(.78))*vec3(1.34,1.16,.84)*1.72;
        vec3 nightWorld=clamp(nightTerrain+cityLights,0.0,1.0);
        vec3 color=mix(nightWorld,dayWorld,daylight);
        color+=dayWorld*max(light,0.0)*daylight*.08;
        gl_FragColor=vec4(color,1.0);
      }`,
  })
}

function GlobeView({ signals, selected, onSelect, onReady, batterySaver = false, radarEnabled = false, satelliteEnabled = false, lightingMode = 'live', autoRotate = true, atmosphereEnabled = true, labelsEnabled = true, qualityMode = 'automatic', initialView = DEFAULT_GEOGRAPHIC_VIEW, onViewChange, onRequestSolar, migration }: Props) {
  const ref = useRef<GlobeMethods | undefined>(undefined)
  const hostRef = useRef<HTMLDivElement>(null)
  const onReadyRef = useRef(onReady)
  const onViewChangeRef = useRef(onViewChange)
  const onRequestSolarRef = useRef(onRequestSolar)
  const solarArmRef = useRef({ armedUntil: 0, timer: 0 })
  const [size, setSize] = useState({ width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) })
  const [ready, setReady] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const [viewpoint, setViewpoint] = useState<GlobeViewpoint>({ lat: initialView.latitude, lng: initialView.longitude, altitude: initialView.altitude })
  const [countries, setCountries] = useState<Array<Feature<Polygon | MultiPolygon>>>([])
  const [radarStatus, setRadarStatus] = useState<'loading' | 'live' | 'error'>('loading')
  const [satelliteStatus, setSatelliteStatus] = useState<'loading' | 'live' | 'error'>('loading')
  const [solarArmed, setSolarArmed] = useState(false)
  const [layerReference, setLayerReference] = useState(Date.now)
  const earthMaterial = useMemo(createEarthMaterial, [])
  const labels = useMemo(() => cityLabelsForView(viewpoint), [viewpoint])
  const points = useMemo(() => signals.filter((signal) => signal.location).slice(0, batterySaver ? 350 : 1200), [signals, batterySaver])
  const rings = useMemo<GlobeRing[]>(() => {
    const notable = points.filter((signal) => (signal.severity ?? 0) >= 58).slice(0, batterySaver ? 8 : 24)
    const signalRings = (selected?.location && !notable.some((signal) => signal.id === selected.id) ? [selected, ...notable] : notable)
      .map((signal) => ({
        id: signal.id,
        lat: signal.location!.latitude,
        lng: signal.location!.longitude,
        color: signal.id === selected?.id ? '#dffffa' : typeColor[signal.type],
        maxRadius: 1.1 + (signal.severity ?? 0) / 24,
        repeatPeriod: 1700,
      }))
    const migrationRings = (migration?.cells ?? [])
      .slice()
      .sort((a, b) => b.observations - a.observations)
      .slice(0, batterySaver ? 4 : 12)
      .map((cell) => ({
        id: `migration-${cell.id}`,
        lat: cell.latitude,
        lng: cell.longitude,
        color: '#a4ffcc',
        maxRadius: Math.min(4.8, 1.8 + Math.log2(cell.observations + 1)),
        repeatPeriod: 2300,
      }))
    return [...signalRings, ...migrationRings]
  }, [batterySaver, migration, points, selected])
  const forecastPaths = useMemo(() => signals.flatMap((signal) => {
    const value = signal.attributes.forecastTrack
    if (!Array.isArray(value)) return []
    const path = value.filter((item): item is [number, number] => Array.isArray(item) && item.length >= 2 && typeof item[0] === 'number' && typeof item[1] === 'number')
    return path.length >= 2 ? [{ signal, points: path.map(([lng, lat]) => ({ lat, lng })) }] : []
  }), [signals])

  useEffect(() => {
    if (!radarEnabled && !satelliteEnabled) return
    const refresh = () => { if (document.visibilityState === 'visible') setLayerReference(Date.now()) }
    refresh()
    const timer = window.setInterval(refresh, 5 * 60_000)
    return () => window.clearInterval(timer)
  }, [radarEnabled, satelliteEnabled])

  useEffect(() => { onReadyRef.current = onReady; onViewChangeRef.current = onViewChange; onRequestSolarRef.current = onRequestSolar }, [onReady, onRequestSolar, onViewChange])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let frame = 0
    const resize = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const rect = host.getBoundingClientRect()
        const width = Math.max(1, Math.round(rect.width))
        const height = Math.max(1, Math.round(rect.height))
        setSize((current) => current.width === width && current.height === height ? current : { width, height })
      })
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    window.visualViewport?.addEventListener('resize', resize, { passive: true })
    resize()
    return () => { observer.disconnect(); window.visualViewport?.removeEventListener('resize', resize); window.cancelAnimationFrame(frame) }
  }, [])

  useEffect(() => {
    if (!labelsEnabled) return
    const controller = new AbortController()
    void fetch(`${import.meta.env.BASE_URL}natural-earth-110m-countries.geojson`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ features?: Array<Feature<Polygon | MultiPolygon>> }> : Promise.reject(new Error('boundaries unavailable')))
      .then((value) => setCountries(Array.isArray(value.features) ? value.features.slice(0, 260) : []))
      .catch(() => { if (!controller.signal.aborted) setCountries([]) })
    return () => controller.abort()
  }, [labelsEnabled])

  useEffect(() => {
    if (!ready) return
    const pixelRatioCap = qualityMode === 'battery' ? 1 : qualityMode === 'quality' ? 2 : 1.5
    ref.current?.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap))
  }, [qualityMode, ready])

  useEffect(() => {
    if (!ready) return
    const globe = ref.current
    const renderer = globe?.renderer()
    const canvas = renderer?.domElement
    if (!globe || !renderer || !canvas) return
    const lost = (event: Event) => { event.preventDefault(); globe.pauseAnimation(); setContextLost(true) }
    const restored = () => {
      const pixelRatioCap = qualityMode === 'battery' ? 1 : qualityMode === 'quality' ? 2 : 1.5
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap))
      setContextLost(false)
      if (document.visibilityState === 'visible') globe.resumeAnimation()
    }
    canvas.addEventListener('webglcontextlost', lost)
    canvas.addEventListener('webglcontextrestored', restored)
    return () => { canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored) }
  }, [qualityMode, ready])

  useEffect(() => () => {
    earthMaterial.uniforms.dayTexture!.value.dispose()
    earthMaterial.uniforms.nightTexture!.value.dispose()
    earthMaterial.dispose()
  }, [earthMaterial])

  useEffect(() => {
    const mode = lightingMode === 'day' ? 1 : lightingMode === 'night' ? 2 : 0
    earthMaterial.uniforms.lightingMode!.value = mode
    const updateSun = () => {
      const point = subsolarPoint()
      earthMaterial.uniforms.sunPosition!.value.set(point.longitude, point.latitude)
    }
    updateSun()
    if (lightingMode !== 'live') return
    const timer = window.setInterval(updateSun, 60_000)
    return () => window.clearInterval(timer)
  }, [earthMaterial, lightingMode])

  useEffect(() => {
    const controls = ref.current?.controls()
    if (!controls) return
    controls.autoRotate = autoRotate && !batterySaver && !selected && document.visibilityState === 'visible'
    controls.autoRotateSpeed = 0.2
    controls.enablePan = false
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.rotateSpeed = 0.48
    controls.zoomSpeed = 0.72
    controls.minDistance = 104
    controls.maxDistance = 440
  }, [autoRotate, batterySaver, selected, ready])

  useEffect(() => {
    if (!ready) return
    const globe = ref.current
    const controls = globe?.controls()
    if (!globe || !controls) return
    const commitView = () => {
      const point = globe.pointOfView()
      const next = clampGeographicView({ latitude: point.lat, longitude: point.lng, altitude: point.altitude })
      setViewpoint((current) => {
        const normalized = { latitude: current.lat, longitude: current.lng, altitude: current.altitude }
        return geographicViewsDiffer(normalized, next) ? { lat: next.latitude, lng: next.longitude, altitude: next.altitude } : current
      })
      onViewChangeRef.current?.(next)
      if (point.altitude < 2.9) {
        solarArmRef.current.armedUntil = 0
        window.clearTimeout(solarArmRef.current.timer)
        setSolarArmed(false)
      } else if (point.altitude >= 3.18) {
        const now = Date.now()
        if (solarArmRef.current.armedUntil >= now) {
          solarArmRef.current.armedUntil = 0
          window.clearTimeout(solarArmRef.current.timer)
          setSolarArmed(false)
          onRequestSolarRef.current?.()
        } else {
          solarArmRef.current.armedUntil = now + 4200
          setSolarArmed(true)
          window.clearTimeout(solarArmRef.current.timer)
          solarArmRef.current.timer = window.setTimeout(() => setSolarArmed(false), 4200)
        }
      }
    }
    controls.addEventListener('end', commitView)
    return () => controls.removeEventListener('end', commitView)
  }, [ready])

  useEffect(() => () => window.clearTimeout(solarArmRef.current.timer), [])

  useEffect(() => {
    const handleVisibility = () => {
      const globe = ref.current
      if (!globe) return
      if (document.visibilityState === 'hidden') globe.pauseAnimation()
      else { globe.resumeAnimation(); const controls = globe.controls(); if (controls) controls.autoRotate = autoRotate && !batterySaver && !selected }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [autoRotate, batterySaver, selected])

  useEffect(() => {
    if (selected?.location) ref.current?.pointOfView({ lat: selected.location.latitude, lng: selected.location.longitude, altitude: 0.72 }, 1350)
  }, [selected])

  useEffect(() => {
    if (!ready || !radarEnabled || batterySaver) return
    const globe = ref.current
    if (!globe) return
    let cancelled = false
    let mesh: Mesh | undefined
    setRadarStatus('loading')
    const texture = new TextureLoader().setCrossOrigin('anonymous').load(noaaRadarImage(), (loaded) => {
      if (cancelled) { loaded.dispose(); return }
      // Keep raster shells well clear of Earth, borders and one another. The
      // former 1.003–1.006 radii were effectively coplanar on mobile GPUs and
      // produced the flicker seen on iPhone when the camera moved.
      mesh = new Mesh(new SphereGeometry(globe.getGlobeRadius() * 1.022, 96, 64), new MeshBasicMaterial({ map: loaded, transparent: true, opacity: 0.7, depthWrite: false }))
      mesh.renderOrder = 4
      globe.scene().add(mesh)
      setRadarStatus('live')
    }, undefined, () => { if (!cancelled) setRadarStatus('error') })
    return () => {
      cancelled = true
      if (mesh) { globe.scene().remove(mesh); mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose() }
      texture.dispose()
    }
  }, [batterySaver, radarEnabled, ready])

  useEffect(() => {
    if (!ready || !satelliteEnabled || batterySaver) return
    const globe = ref.current
    if (!globe) return
    let cancelled = false
    let mesh: Mesh | undefined
    setSatelliteStatus('loading')
    const texture = new TextureLoader().setCrossOrigin('anonymous').load(nasaObservedCloudImage(layerReference), (loaded) => {
      if (cancelled) { loaded.dispose(); return }
      loaded.colorSpace = SRGBColorSpace
      // Daily GIBS true-colour is globally registered. Because this is not a
      // cloud-mask product, reject chromatic terrain aggressively and retain
      // only bright, nearly neutral pixels. This prevents the imagery from
      // painting a second, misaligned Earth over the actual globe.
      const material = new ShaderMaterial({
        uniforms: { cloudTexture: { value: loaded }, opacity: { value: 0.34 } },
        vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: `uniform sampler2D cloudTexture;uniform float opacity;varying vec2 vUv;void main(){vec3 c=texture2D(cloudTexture,vUv).rgb;float hi=max(c.r,max(c.g,c.b));float lo=min(c.r,min(c.g,c.b));float lum=dot(c,vec3(.2126,.7152,.0722));float chroma=hi-lo;float neutral=1.0-smoothstep(.055,.17,chroma);float cloud=smoothstep(.46,.82,lum)*pow(neutral,1.7);if(cloud<.055)discard;vec3 cloudColor=mix(vec3(.78,.88,.92),vec3(.98,1.0,1.0),smoothstep(.55,.92,lum));gl_FragColor=vec4(cloudColor,cloud*opacity);}`,
        transparent: true,
        depthWrite: false,
      })
      mesh = new Mesh(new SphereGeometry(globe.getGlobeRadius() * 1.012, 72, 48), material)
      mesh.renderOrder = 3
      globe.scene().add(mesh)
      setSatelliteStatus('live')
    }, undefined, () => { if (!cancelled) setSatelliteStatus('error') })
    return () => {
      cancelled = true
      if (mesh) { globe.scene().remove(mesh); mesh.geometry.dispose(); (mesh.material as ShaderMaterial).dispose() }
      texture.dispose()
    }
  }, [batterySaver, layerReference, ready, satelliteEnabled])

  return <div ref={hostRef} className="globe-stage" role="img" aria-label={`Interactive Earth showing ${points.length} visible signals`}>
    <Globe
      ref={ref} width={size.width} height={size.height} backgroundColor="rgba(0,0,0,0)" globeMaterial={earthMaterial}
      backgroundImageUrl={`${import.meta.env.BASE_URL}night-sky.png`} showAtmosphere={atmosphereEnabled} atmosphereColor="#9eefff" atmosphereAltitude={0.2}
      labelsData={labelsEnabled ? labels : []} labelLat={(item) => (item as EarthLabel).lat} labelLng={(item) => (item as EarthLabel).lng} labelText={(item) => (item as EarthLabel).name}
      labelColor={(item) => (item as EarthLabel).kind === 'water' ? 'rgba(145,211,230,.82)' : 'rgba(245,251,250,.92)'}
      labelSize={(item) => (item as EarthLabel).kind === 'place' ? Math.max(0.11, Math.min(0.23, 0.12 + Math.log10(Math.max((item as EarthLabel).population ?? 1, 1)) / 60)) : (item as EarthLabel).kind === 'water' ? 0.36 : 0.5}
      labelAltitude={0.013} labelIncludeDot={(item) => (item as EarthLabel).kind === 'place'} labelDotRadius={(item) => (item as EarthLabel).capital ? 0.065 : 0.045} labelResolution={3} labelsTransitionDuration={180}
      polygonsData={labelsEnabled ? countries : []} polygonGeoJsonGeometry={(item) => (item as Feature<Polygon | MultiPolygon>).geometry as never}
      polygonCapColor={() => 'rgba(0,0,0,0)'} polygonSideColor={() => 'rgba(0,0,0,0)'} polygonStrokeColor={() => 'rgba(206,238,235,.22)'} polygonAltitude={0.0025} polygonsTransitionDuration={0}
      pointsData={points} pointLat={(item) => (item as Signal).location!.latitude} pointLng={(item) => (item as Signal).location!.longitude}
      pointAltitude={(item) => 0.008 + ((item as Signal).severity ?? 10) / 5000} pointRadius={(item) => 0.12 + ((item as Signal).severity ?? 10) / 190}
      pointColor={(item) => typeColor[(item as Signal).type]} pointLabel={() => ''} onPointClick={(item) => onSelect(item as Signal)}
      ringsData={rings} ringLat={(item) => (item as GlobeRing).lat} ringLng={(item) => (item as GlobeRing).lng}
      ringColor={(item: object) => (item as GlobeRing).color} ringMaxRadius={(item) => (item as GlobeRing).maxRadius}
      ringPropagationSpeed={batterySaver ? 0 : 0.55} ringRepeatPeriod={(item: object) => batterySaver ? Infinity : (item as GlobeRing).repeatPeriod}
      pathsData={forecastPaths} pathPoints={(item) => (item as { points: Array<{ lat: number; lng: number }> }).points}
      pathPointLat={(point) => (point as { lat: number }).lat} pathPointLng={(point) => (point as { lng: number }).lng}
      pathColor={() => ['rgba(160,220,255,.95)', 'rgba(143,245,232,.42)']} pathStroke={1.2} pathDashLength={0.08} pathDashGap={0.045} pathDashAnimateTime={batterySaver ? 0 : 5200} pathPointAlt={() => 0.018}
      arcsData={migration?.corridors ?? []}
      arcStartLat={(item) => (item as MigrationSnapshot['corridors'][number]).startLatitude}
      arcStartLng={(item) => (item as MigrationSnapshot['corridors'][number]).startLongitude}
      arcEndLat={(item) => (item as MigrationSnapshot['corridors'][number]).endLatitude}
      arcEndLng={(item) => (item as MigrationSnapshot['corridors'][number]).endLongitude}
      arcColor={() => ['rgba(164,255,204,.34)', 'rgba(199,255,222,1)']}
      arcAltitudeAutoScale={0.34} arcStroke={0.68} arcDashLength={0.28} arcDashGap={0.11}
      arcDashAnimateTime={batterySaver ? 0 : 3200}
      hexBinPointsData={migration?.cells ?? []}
      hexBinPointLat={(item) => (item as MigrationSnapshot['cells'][number]).latitude}
      hexBinPointLng={(item) => (item as MigrationSnapshot['cells'][number]).longitude}
      hexBinPointWeight={(item) => Math.min(8, (item as MigrationSnapshot['cells'][number]).observations)}
      hexBinResolution={3} hexMargin={0.13} hexAltitude={(bin) => Math.min(0.085, 0.012 + Number((bin as { sumWeight?: number }).sumWeight ?? 1) / 170)}
      hexTopColor={() => 'rgba(164,255,204,.9)'} hexSideColor={() => 'rgba(54,142,102,.34)'} hexTransitionDuration={300}
      onGlobeReady={() => {
        const globe = ref.current
        const renderer = globe?.renderer()
        const pixelRatioCap = qualityMode === 'battery' ? 1 : qualityMode === 'quality' ? 2 : 1.5
        renderer?.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap))
        if (renderer) renderer.outputColorSpace = SRGBColorSpace
        const initial = clampGeographicView(initialView)
        globe?.pointOfView({ lat: initial.latitude, lng: initial.longitude, altitude: initial.altitude }, 0)
        setReady(true); onReadyRef.current()
      }}
    />
    <div className="environment-status-stack">
      {satelliteEnabled && <div className={`radar-provenance satellite ${satelliteStatus}`}><i/><span>{batterySaver ? 'CLOUDS PAUSED' : satelliteStatus === 'live' ? `NASA VIIRS CLOUDS · OBSERVED ${environmentalLayerStamp('satellite', layerReference).ageMinutes < 60 ? `${environmentalLayerStamp('satellite', layerReference).ageMinutes}M AGO` : `${Math.floor(environmentalLayerStamp('satellite', layerReference).ageMinutes / 60)}H AGO`}` : satelliteStatus === 'error' ? 'CLOUD IMAGERY UNAVAILABLE' : 'ACQUIRING OBSERVED CLOUDS'}</span></div>}
      {radarEnabled && <div className={`radar-provenance ${radarStatus}`}><i/><span>{batterySaver ? 'RADAR PAUSED' : radarStatus === 'live' ? `NOAA MRMS · RETRIEVED ${environmentalLayerStamp('radar', layerReference).ageMinutes}M AGO · US` : radarStatus === 'error' ? 'RADAR UNAVAILABLE' : 'ACQUIRING NOAA RADAR'}</span></div>}
      {migration && <div className={`radar-provenance migration ${migration.freshness}`}><i/><span>GBIF BIRDS · {migration.freshness === 'cached' ? 'CACHED' : 'DERIVED 14D SHIFT'}</span></div>}
    </div>
    {viewpoint.altitude > 2.35 && <div className={`space-transition-cue ${solarArmed ? 'armed' : ''}`}>{solarArmed ? 'PINCH OUT ONCE MORE · LEAVE EARTH' : 'CONTINUE OUTWARD · ORBIT'}</div>}
    {contextLost && <div className="map-loading renderer-recovery"><span/><strong>Restoring Earth</strong><small>Graphics context was interrupted</small></div>}
    <div className="globe-vignette" />
  </div>
}

export default memo(GlobeView)
