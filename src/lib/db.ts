import Dexie, { type EntityTable } from 'dexie'
import type { Discovery, ProviderStatus, Signal } from '../types/signal'
import type { WatchRule } from '../types/watch'

export interface SettingRecord { key: string; value: unknown }
export interface CacheRecord { key: string; providerId: string; fetchedAt: number; expiresAt: number; payload: unknown }

class NexusDatabase extends Dexie {
  signals!: EntityTable<Signal, 'id'>
  discoveries!: EntityTable<Discovery, 'id'>
  providerStatus!: EntityTable<ProviderStatus, 'providerId'>
  settings!: EntityTable<SettingRecord, 'key'>
  cache!: EntityTable<CacheRecord, 'key'>
  watches!: EntityTable<WatchRule, 'id'>

  constructor() {
    super('nexus')
    this.version(1).stores({
      signals: 'id, type, timestamp, source.provider, location.h3Index, expiresAt',
      discoveries: 'id, createdAt, score, status',
      providerStatus: 'providerId, state, lastSuccess',
      settings: 'key',
      cache: 'key, providerId, fetchedAt, expiresAt',
    })
    this.version(2).stores({
      signals: 'id, type, timestamp, source.provider, location.h3Index, expiresAt',
      discoveries: 'id, createdAt, score, status',
      providerStatus: 'providerId, state, lastSuccess',
      settings: 'key',
      cache: 'key, providerId, fetchedAt, expiresAt',
      watches: 'id, enabled, createdAt, target.kind',
    })
  }
}

export const db = new NexusDatabase()

export async function pruneDatabase(now = Date.now()): Promise<void> {
  const thirtyDaysAgo = now - 30 * 86400000
  const sixHoursAgo = now - 6 * 3600000
  await db.transaction('rw', db.signals, db.discoveries, db.cache, async () => {
    const savedDiscoveries = await db.discoveries.where('status').equals('saved').toArray()
    const preservedSignalIds = new Set(savedDiscoveries.flatMap((discovery) => discovery.signalIds))
    await db.signals.where('expiresAt').below(now).filter((signal) => !preservedSignalIds.has(signal.id)).delete()
    await db.signals.where('timestamp').below(thirtyDaysAgo).filter((signal) => signal.type !== 'aircraft' && !preservedSignalIds.has(signal.id)).delete()
    await db.signals.where('timestamp').below(sixHoursAgo).filter((signal) => signal.type === 'aircraft' && !preservedSignalIds.has(signal.id)).delete()
    await db.cache.where('expiresAt').below(now).delete()
  })
}

export async function eraseDatabase(): Promise<void> {
  await db.transaction('rw', db.signals, db.discoveries, db.providerStatus, db.settings, db.cache, async () => {
    await Promise.all([db.signals.clear(), db.discoveries.clear(), db.providerStatus.clear(), db.settings.clear(), db.cache.clear()])
  })
}
