import type { Signal } from '../types/signal'

const typeColor: Record<Signal['type'], string> = {
  earthquake: '#ffb35c', fire: '#ff755e', weather: '#74b7ff', aircraft: '#8ff5e8', satellite: '#b9a4ff',
  'space-weather': '#d6a4ff', media: '#f2da87', environment: '#74d9a1', infrastructure: '#c7d0d0',
}

export function FlatMapView({ signals, selected, onSelect }: { signals: Signal[]; selected?: Signal; onSelect(signal: Signal): void }) {
  const points = signals.filter((signal) => signal.location).slice(0, 700)
  return <div className="flat-map" role="img" aria-label={`World map showing ${points.length} signals`}><div className="map-plane">
    <img src="./earth-texture.svg" alt="" aria-hidden="true" />
    <div className="map-grid" aria-hidden="true" />
    {points.map((signal) => {
      const left = ((signal.location!.longitude + 180) / 360) * 100
      const top = ((90 - signal.location!.latitude) / 180) * 100
      const size = Math.max(7, Math.min(19, 6 + (signal.severity ?? 10) / 10))
      return <button key={signal.id} className={selected?.id === signal.id ? 'map-point selected' : 'map-point'} style={{ left: `${left}%`, top: `${top}%`, width: size, height: size, background: typeColor[signal.type], color: typeColor[signal.type] }} onClick={() => onSelect(signal)} aria-label={`${signal.type}: ${signal.title}`} />
    })}
    <div className="map-attribution">NEXUS ATLAS · EQUIRECTANGULAR OVERVIEW</div>
  </div></div>
}
