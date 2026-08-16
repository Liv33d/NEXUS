import type { SignalProvider } from './types'
import { demoProvider } from './demo'
import { eonetProvider } from './eonet'
import { firmsProvider } from './firms'
import { nwsProvider } from './nws'
import { swpcProvider } from './swpc'
import { usgsProvider } from './usgs'

export const liveProviders: SignalProvider[] = [usgsProvider, nwsProvider, eonetProvider, swpcProvider, firmsProvider]
export const providers: SignalProvider[] = [...liveProviders, demoProvider]
export const providerById = new Map(providers.map((provider) => [provider.id, provider]))
