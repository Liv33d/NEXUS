import { latLngToCell } from 'h3-js'
import { z } from 'zod'
import { signalTypes, type Signal } from '../types/signal'

const safeUrl = z.string().url().refine((url) => ['https:', 'http:'].includes(new URL(url).protocol))

export const signalSchema = z.object({
  id: z.string().min(1).max(240),
  source: z.object({
    provider: z.string().min(1).max(80),
    dataset: z.string().max(120).optional(),
    url: safeUrl.optional(),
    retrievedAt: z.number().int().nonnegative(),
    freshness: z.enum(['live', 'delayed', 'cached', 'demo']),
  }),
  type: z.enum(signalTypes),
  title: z.string().min(1).max(240),
  summary: z.string().max(1200).optional(),
  timestamp: z.number().int().nonnegative(),
  startTime: z.number().int().nonnegative().optional(),
  endTime: z.number().int().nonnegative().optional(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    altitude: z.number().finite().optional(),
    accuracy: z.number().nonnegative().optional(),
    h3Index: z.string().optional(),
  }).optional(),
  magnitude: z.number().finite().optional(),
  severity: z.number().min(0).max(100).optional(),
  confidence: z.number().min(0).max(1).optional(),
  entities: z.array(z.object({ id: z.string(), type: z.enum(['PERSON','ORGANIZATION','LOCATION','AIRCRAFT','SATELLITE','VESSEL','FACILITY','EVENT','COUNTRY','REGION','OTHER']), name: z.string() })).optional(),
  attributes: z.record(z.string(), z.unknown()),
  provenance: z.array(z.object({ label: z.enum(['OFFICIAL_SOURCE','OPEN_DATA','MEDIA_SIGNAL','DERIVED_METRIC','CORRELATION','ESTIMATED','CACHED','DEMO_DATA']), description: z.string(), sourceUrl: safeUrl.optional() })),
  expiresAt: z.number().int().optional(),
})

export function validateSignal(value: unknown): Signal {
  const parsed = signalSchema.parse(value) as Signal
  if (!parsed.location || parsed.location.h3Index) return parsed
  return {
    ...parsed,
    location: {
      ...parsed.location,
      h3Index: latLngToCell(parsed.location.latitude, parsed.location.longitude, h3Resolution(parsed.type)),
    },
  }
}

export function h3Resolution(type: Signal['type']): number {
  return type === 'aircraft' || type === 'fire' ? 6 : type === 'earthquake' ? 5 : 4
}

export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value))
}

export function severityLabel(score: number): DiscoveryLevel {
  if (score >= 81) return 'exceptional'
  if (score >= 61) return 'significant'
  if (score >= 41) return 'unusual'
  if (score >= 21) return 'elevated'
  return 'routine'
}

type DiscoveryLevel = 'routine' | 'elevated' | 'unusual' | 'significant' | 'exceptional'
