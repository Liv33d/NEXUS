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
  isAvailable(): Promise<boolean>
  fetchSignals(context: SignalQueryContext): Promise<Signal[]>
}

export class ProviderError extends Error {
  constructor(message: string, public readonly providerId: string, public readonly recoverable = true) {
    super(message)
  }
}

export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  const parent = options.signal
  const onAbort = () => controller.abort()
  parent?.addEventListener('abort', onAbort, { once: true })
  try {
    return await fetch(url, { ...options, signal: controller.signal, headers: { Accept: 'application/json', ...options.headers } })
  } finally {
    window.clearTimeout(timer)
    parent?.removeEventListener('abort', onAbort)
  }
}
