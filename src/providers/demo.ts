import { createDemoSignals } from '../data/demo'
import type { SignalProvider } from './types'

export const demoProvider: SignalProvider = {
  id: 'demo',
  name: 'NEXUS Demo Network',
  async isAvailable() { return true },
  async fetchSignals() { return createDemoSignals() },
}
