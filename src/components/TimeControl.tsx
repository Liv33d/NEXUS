import type { TimeWindow } from '../store/useNexusStore'

const windows: TimeWindow[] = ['1H', '6H', '24H', '7D']

export function TimeControl({ value, onChange }: { value: TimeWindow; onChange(value: TimeWindow): void }) {
  return <div className="time-control" role="group" aria-label="Time window">{windows.map((window) => <button key={window} className={value === window ? 'active' : ''} onClick={() => onChange(window)}>{window}</button>)}</div>
}
