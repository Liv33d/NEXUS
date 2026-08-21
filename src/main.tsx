import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import './styles.css'

let serviceWorkerReloading = false

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (serviceWorkerReloading) return
    serviceWorkerReloading = true
    window.location.reload()
  })
}

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh: () => {
    void updateServiceWorker(true)
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
