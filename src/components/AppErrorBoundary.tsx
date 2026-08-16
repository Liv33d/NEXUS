import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw, ShieldAlert, Trash2 } from 'lucide-react'

interface State { failed: boolean }

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State { return { failed: true } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('NEXUS recovered from an unrecoverable render error', error, info.componentStack)
  }

  private async clearAndReload() {
    try {
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('nexus')
        request.onsuccess = () => resolve()
        request.onerror = () => resolve()
        request.onblocked = () => resolve()
      })
      for (const key of Object.keys(localStorage)) if (key.startsWith('nexus:')) localStorage.removeItem(key)
      if ('caches' in window) {
        const names = await caches.keys()
        await Promise.all(names.filter((name) => name.startsWith('nexus-') || name.includes('workbox')).map((name) => caches.delete(name)))
      }
    } catch { /* Reload remains available when browser storage is blocked. */ }
    location.reload()
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <main className="fatal-recovery" role="alert"><div className="brand"><span className="brand-mark"/><span>NEXUS</span></div><ShieldAlert/><span className="eyebrow">SAFE MODE</span><h1>Earth encountered a rendering problem.</h1><p>Your saved Cases should still be on this device. Reload first; reset local data only if the problem returns.</p><button onClick={() => location.reload()}><RefreshCw/> Reload NEXUS</button><button className="danger" onClick={() => void this.clearAndReload()}><Trash2/> Reset local data</button></main>
  }
}
