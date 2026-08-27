import { Pause, Play, RadioTower, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Signal } from '../types/signal'
import { replayBounds, signalVisibleAt } from '../lib/temporal'

function clock(value: number) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function ReplayControl({ signals, cutoff, since, until, onCutoff }: { signals: Signal[]; cutoff?: number; since: number; until: number; onCutoff(value?: number): void }) {
  const bounds = useMemo(() => {
    return replayBounds(signals, since, until)
  }, [signals, since, until])
  const [playing, setPlaying] = useState(false)
  const current = cutoff ?? bounds?.end

  useEffect(() => {
    if (!playing || !bounds || current === undefined) return
    const interval = window.setInterval(() => {
      const step = Math.max(60_000, (bounds.end - bounds.start) / 90)
      const next = current + step
      if (next >= bounds.end) { onCutoff(bounds.end); setPlaying(false) }
      else onCutoff(next)
    }, 330)
    return () => window.clearInterval(interval)
  }, [bounds, current, onCutoff, playing])

  if (!bounds || current === undefined || bounds.start === bounds.end) return <div className="replay-empty"><RadioTower/><span><strong>Replay unavailable</strong><small>At least two timestamped observations are required.</small></span></div>

  const visible = signals.filter((signal) => signalVisibleAt(signal, current)).length
  return <section className="replay-control">
    <header><span><RadioTower/> Reality replay</span><strong>{visible}/{signals.length} visible</strong></header>
    <input type="range" min={bounds.start} max={bounds.end} value={current} step={Math.max(1, Math.floor((bounds.end - bounds.start) / 240))} onChange={(event) => { setPlaying(false); onCutoff(Number(event.currentTarget.value)) }} aria-label="Replay position"/>
    <div className="replay-time"><span>{clock(bounds.start)}</span><b>{clock(current)}</b><span>{clock(bounds.end)}</span></div>
    <div className="replay-actions"><button onClick={() => { if (playing) setPlaying(false); else { if (!cutoff || current >= bounds.end) onCutoff(bounds.start); setPlaying(true) } }}>{playing ? <Pause/> : <Play/>}{playing ? 'Pause' : cutoff && current < bounds.end ? 'Continue' : 'Replay'}</button><button onClick={() => { setPlaying(false); onCutoff(undefined) }}><RotateCcw/> Live</button></div>
  </section>
}
