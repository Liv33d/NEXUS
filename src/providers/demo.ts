import { createDemoSignals } from '../data/demo'
import type { SignalProvider } from './types'

export const demoProvider: SignalProvider = {
  id: 'demo',
  name: 'NEXUS Demo Network',
  description: 'Deterministic representative signals for offline exploration.',
  cadenceMs: 30 * 60000,
  dataClass: 'demo',
  async isAvailable() { return true },
  async fetchSignals() { return createDemoSignals() },
}
