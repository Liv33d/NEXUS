import { Binoculars, Bookmark, CircleUserRound, Compass, Earth, Radar, Settings2, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ViewId } from '../store/useNexusStore'

export function TopBar({ offline, demo, onSettings }: { offline: boolean; demo: boolean; onSettings(): void }) {
  return (
    <header className="topbar">
      <div className="brand"><span className="brand-mark" /> <span>NEXUS</span></div>
      <div className="source-state" aria-live="polite">
        {offline ? <><WifiOff size={12}/> OFFLINE DATA</> : demo ? <><Radar size={12}/> DEMO + LIVE</> : <><span className="live-dot"/> LIVE</>}
      </div>
      <button className="icon-button" aria-label="Settings" onClick={onSettings}><Settings2 size={19}/></button>
    </header>
  )
}

const items: Array<{ id: ViewId; label: string; icon: ReactNode }> = [
  { id: 'earth', label: 'Earth', icon: <Earth/> },
  { id: 'discover', label: 'Discover', icon: <Compass/> },
  { id: 'cases', label: 'Cases', icon: <Bookmark/> },
  { id: 'observer', label: 'Observer', icon: <Binoculars/> },
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
