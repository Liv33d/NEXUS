import type { IntelligenceMedia, NexusIntelligenceObject } from '../types/intelligence'

const EXACT_LICENSE_LABELS = new Set([
  'cc0', 'cc0 1.0', 'cc0-1.0', 'public domain', 'publicdomain',
  'cc by 1.0', 'cc by 2.0', 'cc by 2.5', 'cc by 3.0', 'cc by 4.0',
  'u.s. government work', 'us government work',
])

function safeUrl(value: string, allowFixtureData: boolean) {
  if (allowFixtureData && value.startsWith('data:image/')) return true
  try { return new URL(value).protocol === 'https:' } catch { return false }
}

export function isCommercialMediaLicense(license?: string) {
  const normalized = license?.trim().toLowerCase().replace(/\s+/g, ' ') ?? ''
  if (!normalized) return false
  if (EXACT_LICENSE_LABELS.has(normalized)) return true
  try {
    const url = new URL(normalized)
    if (url.protocol !== 'https:' || url.hostname !== 'creativecommons.org') return false
    const path = url.pathname.replace(/\/+$/, '')
    return /^\/publicdomain\/(zero|mark)\/1\.0$/.test(path)
      || /^\/licenses\/by\/(1\.0|2\.0|2\.5|3\.0|4\.0)$/.test(path)
  } catch { return false }
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
