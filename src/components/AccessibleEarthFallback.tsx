import { AlertTriangle, MapPin } from 'lucide-react'
import type { Signal } from '../types/signal'

export function AccessibleEarthFallback({ signals, onSelect }: { signals: Signal[]; onSelect(signal: Signal): void }) {
  const located = signals.filter((signal) => signal.location).sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0)).slice(0, 80)
  return <section className="earth-fallback" aria-label="Accessible Earth signal list">
    <div className="fallback-heading"><AlertTriangle/><span><strong>Map graphics unavailable</strong><small>Live geographic signals remain available as a precise coordinate list.</small></span></div>
    <div className="fallback-list">{located.map((signal) => <button key={signal.id} onClick={() => onSelect(signal)}>
      <i className={`type-dot ${signal.type}`}/><span><strong>{signal.title}</strong><small><MapPin/> {signal.location!.latitude.toFixed(3)}°, {signal.location!.longitude.toFixed(3)}° · {signal.source.provider}</small></span>
    </button>)}</div>
  </section>
}

