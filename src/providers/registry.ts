import type { SignalProvider } from './types'
import { demoProvider } from './demo'
import { eonetProvider } from './eonet'
import { firmsProvider } from './firms'
import { gdacsProvider } from './gdacs'
import { nwsProvider } from './nws'
import { swpcProvider } from './swpc'
import { usgsProvider } from './usgs'
import { volcanoProvider } from './volcano'
import { nhcProvider } from './nhc'
import { openFemaProvider } from './openfema'

export const liveProviders: SignalProvider[] = [usgsProvider, volcanoProvider, nhcProvider, nwsProvider, openFemaProvider, eonetProvider, gdacsProvider, swpcProvider, firmsProvider]
export const providers: SignalProvider[] = [...liveProviders, demoProvider]
export const providerById = new Map(providers.map((provider) => [provider.id, provider]))
