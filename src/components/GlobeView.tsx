import { useEffect, useMemo, useRef, useState } from 'react'
import Globe, { type GlobeMethods } from 'react-globe.gl'
import { Mesh, MeshBasicMaterial, ShaderMaterial, SphereGeometry, SRGBColorSpace, TextureLoader, Vector2 } from 'three'
import { noaaRadarImage } from '../lib/mapLayers'
import type { Signal } from '../types/signal'

interface Props {
  signals: Signal[]
  selected?: Signal
  onSelect(signal: Signal): void
  onReady(): void
  batterySaver?: boolean
  radarEnabled?: boolean
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

function sunPosition(date = new Date()): [number, number] {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const day = (date.getTime() - start) / 86_400_000
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60
  return [(12 - utcHours) * 15, -23.44 * Math.cos((2 * Math.PI / 365.24) * (day + 10))]
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
      sunPosition: { value: new Vector2(...sunPosition()) }, globeRotation: { value: new Vector2() },
    },
    vertexShader: `varying vec3 vNormal; varying vec2 vUv; void main(){vNormal=normalize(normalMatrix*normal);vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      #define PI 3.141592653589793
      uniform sampler2D dayTexture; uniform sampler2D nightTexture; uniform vec2 sunPosition; uniform vec2 globeRotation;
      varying vec3 vNormal; varying vec2 vUv;
      float rad(float value){return value*PI/180.0;}
      vec3 sphereVector(vec2 c){float theta=rad(90.0-c.x);float phi=rad(90.0-c.y);return vec3(sin(phi)*cos(theta),cos(phi),sin(phi)*sin(theta));}
      void main(){
        float lon=rad(globeRotation.x);float lat=-rad(globeRotation.y);
        mat3 rotX=mat3(1,0,0,0,cos(lat),-sin(lat),0,sin(lat),cos(lat));
        mat3 rotY=mat3(cos(lon),0,sin(lon),0,1,0,-sin(lon),0,cos(lon));
        float light=dot(normalize(vNormal),normalize(rotX*rotY*sphereVector(sunPosition)));
        vec4 day=texture2D(dayTexture,vUv);vec4 night=texture2D(nightTexture,vUv);
        vec3 dusk=mix(night.rgb*vec3(.45,.60,.76),day.rgb,smoothstep(-.17,.12,light));
        float rim=pow(1.0-max(dot(normalize(vNormal),vec3(0.0,0.0,1.0)),0.0),3.0);
        gl_FragColor=vec4(dusk+vec3(.02,.10,.12)*rim,1.0);
      }`,
  })
}

export default function GlobeView({ signals, selected, onSelect, onReady, batterySaver = false, radarEnabled = false }: Props) {
  const ref = useRef<GlobeMethods | undefined>(undefined)
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  const [ready, setReady] = useState(false)
  const [viewBand, setViewBand] = useState<'world' | 'near'>('world')
  const [radarStatus, setRadarStatus] = useState<'loading' | 'live' | 'error'>('loading')
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

  useEffect(() => () => {
    earthMaterial.uniforms.dayTexture!.value.dispose()
    earthMaterial.uniforms.nightTexture!.value.dispose()
    earthMaterial.dispose()
  }, [earthMaterial])

  useEffect(() => {
    const controls = ref.current?.controls()
    if (!controls) return
    controls.autoRotate = !batterySaver && !selected && document.visibilityState === 'visible'
    controls.autoRotateSpeed = 0.2
    controls.enablePan = false
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.rotateSpeed = 0.48
    controls.zoomSpeed = 0.72
    controls.minDistance = 104
    controls.maxDistance = 440
  }, [batterySaver, selected, ready])

  useEffect(() => {
    const handleVisibility = () => {
      const globe = ref.current
      if (!globe) return
      if (document.visibilityState === 'hidden') globe.pauseAnimation()
      else { globe.resumeAnimation(); const controls = globe.controls(); if (controls) controls.autoRotate = !batterySaver && !selected }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [batterySaver, selected])

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

  return <div className="globe-stage" role="img" aria-label={`Interactive Earth showing ${points.length} visible signals`}>
    <Globe
      ref={ref} width={size.width} height={size.height} backgroundColor="rgba(0,0,0,0)" globeMaterial={earthMaterial}
      backgroundImageUrl={`${import.meta.env.BASE_URL}night-sky.png`} showAtmosphere atmosphereColor="#8ae9ff" atmosphereAltitude={0.17}
      labelsData={labels} labelLat={(item) => (item as EarthLabel).lat} labelLng={(item) => (item as EarthLabel).lng} labelText={(item) => (item as EarthLabel).name}
      labelColor={(item) => (item as EarthLabel).kind === 'water' ? 'rgba(145,211,230,.82)' : 'rgba(245,251,250,.92)'}
      labelSize={(item) => (item as EarthLabel).kind === 'place' ? 0.22 : (item as EarthLabel).kind === 'water' ? 0.36 : 0.5}
      labelAltitude={0.013} labelIncludeDot={(item) => (item as EarthLabel).kind === 'place'} labelDotRadius={0.07} labelResolution={3} labelsTransitionDuration={280}
      pointsData={points} pointLat={(item) => (item as Signal).location!.latitude} pointLng={(item) => (item as Signal).location!.longitude}
      pointAltitude={(item) => 0.008 + ((item as Signal).severity ?? 10) / 5000} pointRadius={(item) => 0.12 + ((item as Signal).severity ?? 10) / 190}
      pointColor={(item) => typeColor[(item as Signal).type]} pointLabel={() => ''} onPointClick={(item) => onSelect(item as Signal)}
      ringsData={rings} ringLat={(item) => (item as Signal).location!.latitude} ringLng={(item) => (item as Signal).location!.longitude}
      ringColor={(item: object) => (item as Signal).id === selected?.id ? '#dffffa' : typeColor[(item as Signal).type]}
      ringMaxRadius={(item) => 1.1 + ((item as Signal).severity ?? 0) / 24} ringPropagationSpeed={batterySaver ? 0 : 0.55} ringRepeatPeriod={batterySaver ? Infinity : 1700}
      onZoom={({ lng, lat, altitude }) => {
        earthMaterial.uniforms.globeRotation!.value.set(lng, lat)
        const next = altitude < 1.15 ? 'near' : 'world'
        setViewBand((current) => current === next ? current : next)
      }}
      onGlobeReady={() => {
        const globe = ref.current
        const renderer = globe?.renderer()
        renderer?.setPixelRatio(Math.min(window.devicePixelRatio || 1, batterySaver ? 1 : 1.75))
        if (renderer) renderer.outputColorSpace = SRGBColorSpace
        globe?.pointOfView({ lat: 18, lng: -45, altitude: 2.05 }, 900)
        setReady(true); onReady()
      }}
    />
    {radarEnabled && <div className={`radar-provenance ${radarStatus}`}><i/><span>{batterySaver ? 'RADAR PAUSED · BATTERY SAVER' : radarStatus === 'live' ? 'NOAA RADAR · 5 MIN' : radarStatus === 'error' ? 'RADAR UNAVAILABLE' : 'ACQUIRING NOAA RADAR'}</span></div>}
    <div className="globe-vignette" />
  </div>
}
