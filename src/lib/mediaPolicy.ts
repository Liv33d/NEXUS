import type { IntelligenceMedia, NexusIntelligenceObject } from '../types/intelligence'

const COMMERCIAL_LICENSE_MARKERS = [
  'cc0',
  'public domain',
  'publicdomain',
  'creativecommons.org/publicdomain/zero',
  'cc by',
  'creativecommons.org/licenses/by/',
  'u.s. government work',
  'us government work',
]

function safeUrl(value: string, allowFixtureData: boolean) {
  if (allowFixtureData && value.startsWith('data:image/')) return true
  try { return new URL(value).protocol === 'https:' } catch { return false }
}

export function isCommercialMediaLicense(license?: string) {
  const normalized = license?.trim().toLowerCase() ?? ''
  if (!normalized || normalized.includes('-nc') || normalized.includes('/nc/')) return false
  return COMMERCIAL_LICENSE_MARKERS.some((marker) => normalized.includes(marker))
}

export function isDemoIntelligence(object: NexusIntelligenceObject) {
  return object.sourceSignal?.source.freshness === 'demo' || object.provenance.some((entry) => entry.label === 'DEMO_DATA')
}

/**
 * This is the final synchronous gate before a remote URL can reach an image,
 * audio, or animation element. Provider resolvers still rank candidates, but
 * the presentation layer independently requires a safe URL, a commercially
 * usable license, visible attribution, and a traceable source.
 */
export function isRenderableMedia(item: IntelligenceMedia, object: NexusIntelligenceObject) {
  const fixture = isDemoIntelligence(object)
  return safeUrl(item.url, fixture)
    && isCommercialMediaLicense(item.license)
    && item.attribution.trim().length > 0
    && (fixture || Boolean(item.sourceUrl && safeUrl(item.sourceUrl, false)))
}

export function renderableMedia(object: NexusIntelligenceObject) {
  return object.media.filter((item) => isRenderableMedia(item, object))
}
