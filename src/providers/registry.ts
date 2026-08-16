import type { SignalProvider } from './types'
import { demoProvider } from './demo'
import { usgsProvider } from './usgs'

export const providers: SignalProvider[] = [usgsProvider, demoProvider]
export const providerById = new Map(providers.map((provider) => [provider.id, provider]))
