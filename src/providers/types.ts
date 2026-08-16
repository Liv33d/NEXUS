import type { Signal } from '../types/signal'

export interface SignalQueryContext {
  since: number
  until: number
  bounds?: { north: number; south: number; east: number; west: number }
  signal?: AbortSignal
}

export interface SignalProvider {
  id: string
  name: string
  description: string
  cadenceMs: number
  dataClass: 'official' | 'open-data' | 'demo'
  isAvailable(): Promise<boolean>
  fetchSignals(context: SignalQueryContext): Promise<Signal[]>
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly recoverable = true,
    public readonly status?: number,
    public readonly retryAt?: number,
  ) {
    super(message)
  }
}

export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs)
  const parent = options.signal
  const onAbort = () => controller.abort()
  parent?.addEventListener('abort', onAbort, { once: true })
  try {
    return await fetch(url, { ...options, signal: controller.signal, headers: { Accept: 'application/json', ...options.headers } })
  } finally {
    globalThis.clearTimeout(timer)
    parent?.removeEventListener('abort', onAbort)
  }
}

export function providerHttpError(response: Response, providerId: string): ProviderError {
  const retryAfter = response.headers.get('Retry-After')
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN
  const retryDate = retryAfter && !Number.isFinite(seconds) ? Date.parse(retryAfter) : Number.NaN
  const retryAt = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Number.isFinite(retryDate) ? retryDate : undefined
  if (response.status === 429) return new ProviderError('Rate limit reached', providerId, true, 429, retryAt)
  return new ProviderError(`Source returned ${response.status}`, providerId, response.status >= 500, response.status, retryAt)
}
