import { z } from 'zod'
import { fetchWithTimeout } from '../providers/types'

const orbitalObjectSchema = z.object({
  OBJECT_NAME: z.string(), OBJECT_ID: z.string().optional(), EPOCH: z.string(), MEAN_MOTION: z.number(), ECCENTRICITY: z.number(),
  INCLINATION: z.number(), RA_OF_ASC_NODE: z.number(), ARG_OF_PERICENTER: z.number(), MEAN_ANOMALY: z.number(),
  EPHEMERIS_TYPE: z.number(), CLASSIFICATION_TYPE: z.string(), NORAD_CAT_ID: z.number(), ELEMENT_SET_NO: z.number().optional(),
  REV_AT_EPOCH: z.number().optional(), BSTAR: z.number(), MEAN_MOTION_DOT: z.number(), MEAN_MOTION_DDOT: z.number(),
}).passthrough()
const snapshotSchema = z.object({ generatedAt: z.string().nullable(), objects: z.array(orbitalObjectSchema).max(10) })

export type OrbitalObject = z.infer<typeof orbitalObjectSchema>
export interface OrbitalPass { objectName: string; catalogId: number; start: number; peak: number; end: number; maxElevation: number; darkSky: boolean }

export async function loadOrbitalElements(signal?: AbortSignal): Promise<{ generatedAt?: number; objects: OrbitalObject[] }> {
  const response = await fetchWithTimeout(`${import.meta.env.BASE_URL}data/orbital-elements.json`, { signal }, 6000)
  if (!response.ok) throw new Error('Orbital elements unavailable')
  const value = snapshotSchema.parse(await response.json())
  return { generatedAt: value.generatedAt ? Date.parse(value.generatedAt) : undefined, objects: value.objects }
}

export function calculateOrbitalPasses(objects: OrbitalObject[], latitude: number, longitude: number, from = Date.now()): Promise<OrbitalPass[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/orbit.worker.ts', import.meta.url), { type: 'module' })
    const timeout = window.setTimeout(() => { worker.terminate(); reject(new Error('Orbit calculation timed out')) }, 10_000)
    worker.onmessage = (event: MessageEvent<{ passes?: OrbitalPass[]; error?: string }>) => {
      window.clearTimeout(timeout); worker.terminate()
      if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.passes ?? [])
    }
    worker.onerror = () => { window.clearTimeout(timeout); worker.terminate(); reject(new Error('Orbit worker failed')) }
    worker.postMessage({ objects, latitude, longitude, from })
  })
}
