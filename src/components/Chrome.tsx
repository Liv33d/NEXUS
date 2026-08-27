import { Bookmark, CircleUserRound, Compass, Earth, LoaderCircle, Radar, Settings2, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ViewId } from '../store/useNexusStore'
import type { DataTruthState } from '../lib/dataTruth'

export function TopBar({ state, liveSources = 0, asOf, onSettings }: { state: DataTruthState; liveSources?: number; asOf?: number; onSettings(): void }) {
  const storedAsOf = asOf ? new Date(asOf).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : undefined
  const truth = state === 'demo' ? <><Radar size={12}/> DEMO · NOT LIVE</>
    : state === 'updating' ? <><LoaderCircle className="status-spinner" size={12}/> UPDATING</>
    : state === 'live' ? <><span className="live-dot"/> LIVE · {liveSources} SOURCES</>
    : state === 'live-stored' ? <><span className="live-dot"/> LIVE + STORED</>
    : state === 'stored' ? <><WifiOff size={12}/> STORED{storedAsOf ? ` · AS OF ${storedAsOf}` : ''}</>
    : <><WifiOff size={12}/> LIMITED</>
  return (
    <header className="topbar">
      <div className="brand"><span className="brand-mark" /> <span>NEXUS</span></div>
      <div className="source-state" aria-live="polite">
        {truth}
      </div>
      <button className="icon-button" aria-label="Settings" onClick={onSettings}><Settings2 size={19}/></button>
    </header>
  )
}

const items: Array<{ id: ViewId; label: string; icon: ReactNode }> = [
  { id: 'earth', label: 'Earth', icon: <Earth/> },
  { id: 'discover', label: 'Today', icon: <Compass/> },
  { id: 'cases', label: 'Yours', icon: <Bookmark/> },
]

export function BottomNav({ view, onChange }: { view: ViewId; onChange(view: ViewId): void }) {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {items.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => onChange(item.id)}>{item.icon}<span>{item.label}</span></button>)}
    </nav>
  )
}

export function EmptyState({ icon = <CircleUserRound/>, title, children }: { icon?: ReactNode; title: string; children: ReactNode }) {
  return <div className="empty-state"><span>{icon}</span><h2>{title}</h2><p>{children}</p></div>
}
