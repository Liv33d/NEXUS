import type { Signal } from '../types/signal'
import { ProviderError, type SignalProvider, type SignalQueryContext } from './types'

const inFlight = new Map<string, Promise<Signal[]>>()

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    const timer = globalThis.setTimeout(() => { cleanup(); resolve() }, ms)
    const onAbort = () => { globalThis.clearTimeout(timer); cleanup(); reject(new DOMException('Aborted', 'AbortError')) }
    if (signal?.aborted) { onAbort(); return }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function runProvider(provider: SignalProvider, context: SignalQueryContext): Promise<Signal[]> {
  const key = `${provider.id}:${Math.floor(context.since / provider.cadenceMs)}:${Math.floor(context.until / provider.cadenceMs)}`
  const existing = inFlight.get(key)
  if (existing) return existing

  const request = (async () => {
    if (!await provider.isAvailable()) throw new ProviderError('Network unavailable', provider.id)
    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await provider.fetchSignals(context)
      } catch (error) {
        lastError = error
        if (context.signal?.aborted || (error instanceof ProviderError && (!error.recoverable || error.status === 429)) || attempt === 1) break
        await wait(350 + attempt * 650, context.signal)
      }
    }
    throw lastError
  })().finally(() => inFlight.delete(key))

  inFlight.set(key, request)
  return request
}
