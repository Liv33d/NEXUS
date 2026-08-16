import { useEffect, useMemo, useRef, useState } from 'react'
import Globe, { type GlobeMethods } from 'react-globe.gl'
import { AdditiveBlending, Mesh, MeshBasicMaterial, ShaderMaterial, SphereGeometry, SRGBColorSpace, TextureLoader, Vector2 } from 'three'
import { noaaGeoColorImage, noaaRadarImage } from '../lib/mapLayers'
import { subsolarPoint } from '../lib/solar'
import type { Signal } from '../types/signal'

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
}

interface EarthLabel { name: string; lat: number; lng: number; kind: 'land' | 'water' | 'place' }

const WORLD_LABELS: EarthLabel[] = [
  { name: 'NORTH AMERICA', lat: 47, lng: -103, kind: 'land' }, { name: 'SOUTH AMERICA', lat: -18, lng: -59, kind: 'land' },
  { name: 'EUROPE', lat: 50, lng: 17, kind: 'land' }, { name: 'AFRICA', lat: 8, lng: 20, kind: 'land' },
  { name: 'ASIA', lat: 46, lng: 88, kind: 'land' }, { name: 'AUSTRALIA', lat: -25, lng: 134, kind: 'land' },
  { name: 'PACIFIC OCEAN', lat: 4, lng: -150, kind: 'water' }, { name: 'ATLANTIC OCEAN', lat: 18, lng: -35, kind: 'water' },
  { name: 'INDIAN OCEAN', lat: -22, lng: 80, kind: 'water' }, { name: 'ARCTIC OCEAN', lat: 74, lng: 20, kind: 'water' },
]

const PLACE_LABELS: EarthLabel[] = [
  ['New York', 40.71, -74.01], ['Los Angeles', 34.05, -118.24], ['Mexico City', 19.43, -99.13], ['São Paulo', -23.55, -46.63],
  ['London', 51.51, -0.13], ['Paris', 48.86, 2.35], ['Lagos', 6.52, 3.38], ['Cairo', 30.04, 31.24],
  ['Istanbul', 41.01, 28.98], ['Moscow', 55.76, 37.62], ['Dubai', 25.2, 55.27], ['Delhi', 28.61, 77.21],
  ['Singapore', 1.35, 103.82], ['Beijing', 39.9, 116.41], ['Tokyo', 35.68, 139.69], ['Seoul', 37.57, 126.98],
  ['Jakarta', -6.21, 106.85], ['Sydney', -33.87, 151.21], ['Auckland', -36.85, 174.76],
].map(([name, lat, lng]) => ({ name: name as string, lat: lat as number, lng: lng as number, kind: 'place' as const }))

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
        vec3 nightTerrain=pow(max(day.rgb,vec3(0.0)),vec3(.86))*vec3(.055,.075,.12);
        vec3 cityLights=night.rgb*vec3(1.28,1.12,.82)*1.55;
        vec3 nightWorld=nightTerrain+cityLights;
        vec3 color=mix(nightWorld,dayWorld,daylight);
        color+=dayWorld*max(light,0.0)*daylight*.08;
        gl_FragColor=vec4(color,1.0);
      }`,
  })
}

export default function GlobeView({ signals, selected, onSelect, onReady, batterySaver = false, radarEnabled = false, satelliteEnabled = false, lightingMode = 'live', autoRotate = true, atmosphereEnabled = true, labelsEnabled = true, qualityMode = 'automatic' }: Props) {
  const ref = useRef<GlobeMethods | undefined>(undefined)
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  const [ready, setReady] = useState(false)
  const [viewBand, setViewBand] = useState<'world' | 'near'>('world')
  const [radarStatus, setRadarStatus] = useState<'loading' | 'live' | 'error'>('loading')
  const [satelliteStatus, setSatelliteStatus] = useState<'loading' | 'live' | 'error'>('loading')
  const earthMaterial = useMemo(createEarthMaterial, [])
  const labels = viewBand === 'world' ? WORLD_LABELS : PLACE_LABELS
  const points = useMemo(() => signals.filter((signal) => signal.location).slice(0, batterySaver ? 350 : 1200), [signals, batterySaver])
  const rings = useMemo(() => {
    const notable = points.filter((signal) => (signal.severity ?? 0) >= 58).slice(0, batterySaver ? 8 : 24)
    return selected?.location && !notable.some((signal) => signal.id === selected.id) ? [selected, ...notable] : notable
  }, [batterySaver, points, selected])

  useEffect(() => {
    const resize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    if (!ready) return
    const pixelRatioCap = qualityMode === 'battery' ? 1 : qualityMode === 'quality' ? 2 : 1.5
    ref.current?.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap))
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
      mesh = new Mesh(new SphereGeometry(globe.getGlobeRadius() * 1.006, 96, 64), new MeshBasicMaterial({ map: loaded, transparent: true, opacity: 0.78, depthWrite: false }))
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
    const texture = new TextureLoader().setCrossOrigin('anonymous').load(noaaGeoColorImage(), (loaded) => {
      if (cancelled) { loaded.dispose(); return }
      loaded.colorSpace = SRGBColorSpace
      mesh = new Mesh(new SphereGeometry(globe.getGlobeRadius() * 1.003, 96, 64), new MeshBasicMaterial({ map: loaded, transparent: true, opacity: 0.34, depthWrite: false, blending: AdditiveBlending }))
      mesh.renderOrder = 3
      globe.scene().add(mesh)
      setSatelliteStatus('live')
    }, undefined, () => { if (!cancelled) setSatelliteStatus('error') })
    return () => {
      cancelled = true
      if (mesh) { globe.scene().remove(mesh); mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose() }
      texture.dispose()
    }
  }, [batterySaver, ready, satelliteEnabled])

  return <div className="globe-stage" role="img" aria-label={`Interactive Earth showing ${points.length} visible signals`}>
    <Globe
      ref={ref} width={size.width} height={size.height} backgroundColor="rgba(0,0,0,0)" globeMaterial={earthMaterial}
      backgroundImageUrl={`${import.meta.env.BASE_URL}night-sky.png`} showAtmosphere={atmosphereEnabled} atmosphereColor="#9eefff" atmosphereAltitude={0.2}
      labelsData={labelsEnabled ? labels : []} labelLat={(item) => (item as EarthLabel).lat} labelLng={(item) => (item as EarthLabel).lng} labelText={(item) => (item as EarthLabel).name}
      labelColor={(item) => (item as EarthLabel).kind === 'water' ? 'rgba(145,211,230,.82)' : 'rgba(245,251,250,.92)'}
      labelSize={(item) => (item as EarthLabel).kind === 'place' ? 0.22 : (item as EarthLabel).kind === 'water' ? 0.36 : 0.5}
      labelAltitude={0.013} labelIncludeDot={(item) => (item as EarthLabel).kind === 'place'} labelDotRadius={0.07} labelResolution={3} labelsTransitionDuration={280}
      pointsData={points} pointLat={(item) => (item as Signal).location!.latitude} pointLng={(item) => (item as Signal).location!.longitude}
      pointAltitude={(item) => 0.008 + ((item as Signal).severity ?? 10) / 5000} pointRadius={(item) => 0.12 + ((item as Signal).severity ?? 10) / 190}
      pointColor={(item) => typeColor[(item as Signal).type]} pointLabel={() => ''} onPointClick={(item) => onSelect(item as Signal)}
      ringsData={rings} ringLat={(item) => (item as Signal).location!.latitude} ringLng={(item) => (item as Signal).location!.longitude}
      ringColor={(item: object) => (item as Signal).id === selected?.id ? '#dffffa' : typeColor[(item as Signal).type]}
      ringMaxRadius={(item) => 1.1 + ((item as Signal).severity ?? 0) / 24} ringPropagationSpeed={batterySaver ? 0 : 0.55} ringRepeatPeriod={batterySaver ? Infinity : 1700}
      onZoom={({ altitude }) => {
        const next = altitude < 1.15 ? 'near' : 'world'
        setViewBand((current) => current === next ? current : next)
      }}
      onGlobeReady={() => {
        const globe = ref.current
        const renderer = globe?.renderer()
        const pixelRatioCap = qualityMode === 'battery' ? 1 : qualityMode === 'quality' ? 2 : 1.5
        renderer?.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap))
        if (renderer) renderer.outputColorSpace = SRGBColorSpace
        globe?.pointOfView({ lat: 18, lng: -45, altitude: 2.05 }, 900)
        setReady(true); onReady()
      }}
    />
    <div className="environment-status-stack">
      {satelliteEnabled && <div className={`radar-provenance satellite ${satelliteStatus}`}><i/><span>{batterySaver ? 'SATELLITE PAUSED' : satelliteStatus === 'live' ? 'NOAA GEOCOLOR · LATEST' : satelliteStatus === 'error' ? 'SATELLITE UNAVAILABLE' : 'ACQUIRING SATELLITE'}</span></div>}
      {radarEnabled && <div className={`radar-provenance ${radarStatus}`}><i/><span>{batterySaver ? 'RADAR PAUSED' : radarStatus === 'live' ? 'NOAA RADAR · 5 MIN' : radarStatus === 'error' ? 'RADAR UNAVAILABLE' : 'ACQUIRING NOAA RADAR'}</span></div>}
    </div>
    <div className="globe-vignette" />
  </div>
}
