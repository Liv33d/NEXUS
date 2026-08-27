import { z } from 'zod'
import { fetchWithTimeout } from '../providers/types'
import { isCommercialMediaLicense } from './mediaPolicy'

const vernacularSchema = z.object({ results: z.array(z.object({ vernacularName: z.string().max(300), language: z.string().max(12).optional(), country: z.string().max(3).optional() })).max(500) })
const mediaCandidateSchema = z.object({ type: z.string().optional(), format: z.string().optional(), identifier: z.string().url(), license: z.string().max(300).optional(), creator: z.string().max(300).optional(), rightsHolder: z.string().max(300).optional(), source: z.string().max(500).optional(), references: z.string().url().optional() })
const mediaSchema = z.object({ results: z.array(z.unknown()).max(100) })

export interface TaxonMedia { url: string; creator: string; license: string; source: string; sourceUrl: string }
export interface TaxonPresentation { commonName?: string; media?: TaxonMedia }
interface VernacularName { vernacularName: string; language?: string; country?: string }
export interface GbifMediaCandidate { type?: string; format?: string; identifier: string; license?: string; creator?: string; rightsHolder?: string; source?: string; references?: string }
const cache = new Map<string, TaxonPresentation>()

const languageAliases: Record<string, string[]> = {
  en: ['en', 'eng'], es: ['es', 'spa'], fr: ['fr', 'fra'], de: ['de', 'deu', 'ger'], pt: ['pt', 'por'], it: ['it', 'ita'], nl: ['nl', 'nld', 'dut'],
  ja: ['ja', 'jpn'], zh: ['zh', 'zho', 'chi'], ko: ['ko', 'kor'], ar: ['ar', 'ara'], ru: ['ru', 'rus'], pl: ['pl', 'pol'], sv: ['sv', 'swe'],
}

export function selectVernacularName(names: VernacularName[], requestedLocale: string): string | undefined {
  const locale = requestedLocale.toLowerCase()
  const [base, region] = locale.split('-')
  const accepted = new Set(languageAliases[base ?? ''] ?? [base])
  const matchesLanguage = (name: VernacularName) => accepted.has(name.language?.toLowerCase() ?? '')
  const humanNames = names.filter((name) => {
    const value = name.vernacularName.trim()
    return value.length >= 3 && !/\d/.test(value) && !(value.length <= 7 && value === value.toLocaleUpperCase() && /^[A-Z]+$/.test(value))
  })
  return humanNames.find((name) => matchesLanguage(name) && (!name.country || name.country.toLowerCase() === region))?.vernacularName
    ?? humanNames.find(matchesLanguage)?.vernacularName
    ?? humanNames.find((name) => ['en', 'eng'].includes(name.language?.toLowerCase() ?? ''))?.vernacularName
    ?? humanNames[0]?.vernacularName
}

export function normalizeGbifMediaLicense(license?: string): string | undefined {
  const value = license?.trim().toLowerCase().replace(/\s+/g, ' ') ?? ''
  if (!value || /(?:^|[- /])(?:nc|nd|sa)(?:[- /.]|$)/.test(value)) return undefined
  if (/^(?:cc0|cc0[ -]1\.0)$/.test(value) || /^https?:\/\/creativecommons\.org\/publicdomain\/zero\/1\.0\/?(?:legalcode\/?)?$/.test(value)) return 'CC0-1.0'
  if (value === 'public domain' || value === 'publicdomain' || /^https?:\/\/creativecommons\.org\/publicdomain\/mark\/1\.0\/?$/.test(value)) return 'Public Domain'
  const label = value.match(/^cc by (1\.0|2\.0|2\.5|3\.0|4\.0)$/)
  const url = value.match(/^https?:\/\/creativecommons\.org\/licenses\/by\/(1\.0|2\.0|2\.5|3\.0|4\.0)\/?(?:legalcode\/?)?$/)
  const version = label?.[1] ?? url?.[1]
  return version ? `CC BY ${version}` : undefined
}

function isHttps(value: string) {
  try { return new URL(value).protocol === 'https:' } catch { return false }
}

/**
 * GBIF's species-media response does not expose reliable pixel dimensions, so
 * this intentionally does not invent a resolution/clarity score. Eligible
 * records are ranked by reusable-license strength and metadata completeness,
 * then by stable lexical fields so API response order cannot change the hero.
 */
export function selectGbifMediaCandidate(candidates: GbifMediaCandidate[]): TaxonMedia | undefined {
  const eligible = candidates.flatMap((candidate) => {
    const license = normalizeGbifMediaLicense(candidate.license)
    const creator = candidate.creator?.trim() || candidate.rightsHolder?.trim()
    const sourceUrl = candidate.references?.trim()
    if (candidate.type !== 'StillImage'
      || !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(candidate.format?.toLowerCase() ?? '')
      || !license || !isCommercialMediaLicense(license)
      || !creator || !sourceUrl || !isHttps(sourceUrl) || !isHttps(candidate.identifier)) return []
    const licenseScore = license === 'CC0-1.0' || license === 'Public Domain' ? 20 : 10
    const metadataScore = (candidate.creator?.trim() ? 2 : 0) + (candidate.source?.trim() ? 1 : 0)
    return [{ candidate, creator, license, sourceUrl, score: licenseScore + metadataScore }]
  })
  eligible.sort((a, b) => b.score - a.score
    || a.candidate.identifier.localeCompare(b.candidate.identifier)
    || a.sourceUrl.localeCompare(b.sourceUrl))
  const best = eligible[0]
  if (!best) return undefined
  return {
    url: best.candidate.identifier,
    creator: best.creator,
    license: best.license,
    source: best.candidate.source?.trim() || new URL(best.sourceUrl).hostname,
    sourceUrl: best.sourceUrl,
  }
}

export async function fetchGbifTaxonPresentation(taxonKey: number, _fallbackUrl: string, signal?: AbortSignal): Promise<TaxonPresentation> {
  const locale = typeof navigator === 'undefined' ? 'en' : navigator.language.toLowerCase()
  const cacheKey = `${taxonKey}:${locale}`
  const cached = cache.get(cacheKey)
  if (cached) return cached
  const [namesResult, mediaResult] = await Promise.allSettled([
    fetchWithTimeout(`https://api.gbif.org/v1/species/${taxonKey}/vernacularNames`, { signal }, 7000),
    fetchWithTimeout(`https://api.gbif.org/v1/species/${taxonKey}/media?limit=100`, { signal }, 7000),
  ])
  let commonName: string | undefined
  if (namesResult.status === 'fulfilled' && namesResult.value.ok) {
    try { commonName = selectVernacularName(vernacularSchema.parse(await namesResult.value.json()).results, locale) } catch { /* One enhancement must not collapse the card. */ }
  }
  let media: TaxonMedia | undefined
  if (mediaResult.status === 'fulfilled' && mediaResult.value.ok) {
    try {
      const payload = mediaSchema.parse(await mediaResult.value.json())
      const candidates = payload.results.flatMap((candidate) => { const parsed = mediaCandidateSchema.safeParse(candidate); return parsed.success ? [parsed.data] : [] })
      media = selectGbifMediaCandidate(candidates)
    } catch { /* One malformed media response must not remove a valid name. */ }
  }
  const presentation = { commonName, media }
  if (!signal?.aborted && (commonName || media)) cache.set(cacheKey, presentation)
  return presentation
}

export function clearGbifPresentationCache() { cache.clear() }
