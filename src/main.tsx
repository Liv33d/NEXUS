import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import './styles.css'

registerSW({
  immediate: true,
  onNeedRefresh: () => {
    // The waiting worker activates after every NEXUS tab closes. Never force
    // a live tab to reload while a Case note or selection may be unsaved.
    document.documentElement.dataset.updateReady = 'true'
  },
  onRegisteredSW: (_serviceWorkerUrl, registration) => {
    if (!registration) return
    window.setInterval(() => {
      void registration.update()
    }, 30 * 60 * 1000)
  },
})

if ('caches' in window) {
  void caches.delete('nexus-global-radar')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>,
)
