import { ArrowUpRight, Bookmark, Clock3, Network } from 'lucide-react'
import type { Discovery } from '../types/signal'

export function DiscoveryCard({ discovery, index, onOpen, onSave }: { discovery: Discovery; index: number; onOpen(): void; onSave(): void }) {
  return (
    <article className={`discovery-card level-${discovery.level}`}>
      <div className="discovery-top"><span>DISCOVERY {String(index + 1).padStart(4, '0')}</span><span>{discovery.level}</span></div>
      <h3>{discovery.title}</h3>
      <p>{discovery.description}</p>
      <div className="discovery-meta"><span><Network size={14}/>{discovery.signalIds.length} {discovery.signalIds.length === 1 ? 'signal' : 'signals'}</span><span><Clock3 size={14}/>{new Date(discovery.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
      <div className="score-row"><div><span>Anomaly score</span><strong>{discovery.score}</strong></div><div className="score-track"><i style={{ width: `${discovery.score}%` }}/></div></div>
      <div className="card-actions"><button onClick={onSave} aria-label={discovery.status === 'saved' ? 'Discovery saved as a Case' : 'Save discovery'} disabled={discovery.status === 'saved'}><Bookmark size={17}/>{discovery.status === 'saved' ? 'Saved' : 'Save'}</button><button className="primary" onClick={onOpen}>Investigate <ArrowUpRight size={17}/></button></div>
    </article>
  )
}
