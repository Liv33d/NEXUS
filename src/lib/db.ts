import Dexie, { type EntityTable } from 'dexie'
import type { Discovery, ProviderStatus, Signal } from '../types/signal'

export interface SettingRecord { key: string; value: unknown }
export interface CacheRecord { key: string; providerId: string; fetchedAt: number; expiresAt: number; payload: unknown }

class NexusDatabase extends Dexie {
  signals!: EntityTable<Signal, 'id'>
  discoveries!: EntityTable<Discovery, 'id'>
  providerStatus!: EntityTable<ProviderStatus, 'providerId'>
  settings!: EntityTable<SettingRecord, 'key'>
  cache!: EntityTable<CacheRecord, 'key'>

  constructor() {
    super('nexus')
    this.version(1).stores({
      signals: 'id, type, timestamp, source.provider, location.h3Index, expiresAt',
      discoveries: 'id, createdAt, score, status',
      providerStatus: 'providerId, state, lastSuccess',
      settings: 'key',
      cache: 'key, providerId, fetchedAt, expiresAt',
    })
  }
}

export const db = new NexusDatabase()

export async function pruneDatabase(now = Date.now()): Promise<void> {
  const thirtyDaysAgo = now - 30 * 86400000
  const sixHoursAgo = now - 6 * 3600000
  await db.transaction('rw', db.signals, db.cache, async () => {
    await db.signals.where('expiresAt').below(now).delete()
    await db.signals.where('timestamp').below(thirtyDaysAgo).filter((signal) => signal.type !== 'aircraft').delete()
    await db.signals.where('timestamp').below(sixHoursAgo).filter((signal) => signal.type === 'aircraft').delete()
    await db.cache.where('expiresAt').below(now).delete()
  })
}
