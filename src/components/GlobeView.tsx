import { useEffect, useMemo, useRef, useState } from 'react'
import Globe, { type GlobeMethods } from 'react-globe.gl'
import type { Signal } from '../types/signal'

interface Props {
  signals: Signal[]
  selected?: Signal
  onSelect(signal: Signal): void
  onReady(): void
  batterySaver?: boolean
}

const typeColor: Record<Signal['type'], string> = {
  earthquake: '#ffb35c', fire: '#ff755e', weather: '#74b7ff', aircraft: '#8ff5e8', satellite: '#b9a4ff',
  'space-weather': '#d6a4ff', media: '#f2da87', environment: '#74d9a1', infrastructure: '#c7d0d0',
}

export default function GlobeView({ signals, selected, onSelect, onReady, batterySaver = false }: Props) {
  const ref = useRef<GlobeMethods | undefined>(undefined)
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  const points = useMemo(() => signals.filter((signal) => signal.location).slice(0, batterySaver ? 350 : 1200), [signals, batterySaver])

  useEffect(() => {
    const resize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    const controls = ref.current?.controls()
    if (!controls) return
    controls.autoRotate = !batterySaver && !selected && document.visibilityState === 'visible'
    controls.autoRotateSpeed = 0.24
    controls.enablePan = false
    controls.minDistance = 130
    controls.maxDistance = 430
  }, [batterySaver, selected])

  useEffect(() => {
    if (!selected?.location) return
    ref.current?.pointOfView({ lat: selected.location.latitude, lng: selected.location.longitude, altitude: 1.45 }, 1100)
  }, [selected])

  return (
    <div className="globe-stage" role="img" aria-label={`Interactive Earth showing ${points.length} visible signals`}>
      <Globe
        ref={ref}
        width={size.width}
        height={size.height}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="./earth-texture.svg"
        showAtmosphere
        atmosphereColor="#4ad8d0"
        atmosphereAltitude={0.12}
        pointsData={points}
        pointLat={(item) => (item as Signal).location!.latitude}
        pointLng={(item) => (item as Signal).location!.longitude}
        pointAltitude={(item) => 0.012 + ((item as Signal).severity ?? 10) / 3500}
        pointRadius={(item) => 0.18 + ((item as Signal).severity ?? 10) / 120}
        pointColor={(item) => typeColor[(item as Signal).type]}
        pointLabel={() => ''}
        onPointClick={(item) => onSelect(item as Signal)}
        ringsData={points.filter((signal) => (signal.severity ?? 0) >= 58).slice(0, 24)}
        ringLat={(item) => (item as Signal).location!.latitude}
        ringLng={(item) => (item as Signal).location!.longitude}
        ringColor={(item: object) => typeColor[(item as Signal).type]}
        ringMaxRadius={(item) => 1.5 + ((item as Signal).severity ?? 0) / 20}
        ringPropagationSpeed={batterySaver ? 0 : 0.55}
        ringRepeatPeriod={batterySaver ? Infinity : 1700}
        onGlobeReady={onReady}
      />
      <div className="globe-vignette" />
    </div>
  )
}
