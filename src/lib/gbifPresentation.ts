import { z } from 'zod'
import { fetchWithTimeout } from '../providers/types'

const vernacularSchema = z.object({ results: z.array(z.object({ vernacularName: z.string().max(300), language: z.string().max(12).optional(), country: z.string().max(3).optional() })).max(500) })
const mediaSchema = z.object({ results: z.array(z.object({ type: z.string().optional(), format: z.string().optional(), identifier: z.string().url(), license: z.string().max(300).optional(), creator: z.string().max(300).optional(), rightsHolder: z.string().max(300).optional(), source: z.string().max(500).optional(), references: z.string().url().optional() })).max(100) })

export interface TaxonMedia { url: string; creator: string; license: string; source: string; sourceUrl: string }
export interface TaxonPresentation { commonName?: string; media?: TaxonMedia }
interface VernacularName { vernacularName: string; language?: string; country?: string }
const cache = new Map<number, Promise<TaxonPresentation>>()

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

function commerciallyUsable(license?: string) {
  const value = license?.toLowerCase() ?? ''
  return value === 'cc0' || value.includes('publicdomain') || value.includes('/zero/') || ((value === 'cc by' || value.startsWith('cc by ') || value.includes('/by/4.0')) && !value.includes('-nc') && !value.includes('-nd'))
}

function requiresAttribution(license?: string) {
  const value = license?.toLowerCase() ?? ''
  return value === 'cc by' || value.startsWith('cc by ') || value.includes('/by/4.0')
}

export function fetchGbifTaxonPresentation(taxonKey: number, fallbackUrl: string, signal?: AbortSignal): Promise<TaxonPresentation> {
  const cached = cache.get(taxonKey)
  if (cached) return cached
  const request = (async () => {
    const locale = typeof navigator === 'undefined' ? 'en' : navigator.language.toLowerCase()
    const [namesResponse, mediaResponse] = await Promise.all([
      fetchWithTimeout(`https://api.gbif.org/v1/species/${taxonKey}/vernacularNames`, { signal }, 7000),
      fetchWithTimeout(`https://api.gbif.org/v1/species/${taxonKey}/media?limit=100`, { signal }, 7000),
    ])
    let commonName: string | undefined
    if (namesResponse.ok) {
      const names = vernacularSchema.parse(await namesResponse.json()).results
      commonName = selectVernacularName(names, locale)
    }
    let media: TaxonMedia | undefined
    if (mediaResponse.ok) {
      const item = mediaSchema.parse(await mediaResponse.json()).results.find((candidate) => {
        const creator = candidate.creator?.trim() || candidate.rightsHolder?.trim()
        return candidate.type === 'StillImage' && candidate.format?.startsWith('image/') && commerciallyUsable(candidate.license) && (!requiresAttribution(candidate.license) || Boolean(creator) && Boolean(candidate.references))
      })
      if (item) media = { url: item.identifier, creator: item.creator?.trim() || item.rightsHolder?.trim() || 'Public domain', license: item.license!, source: item.source ?? 'GBIF species media', sourceUrl: item.references ?? fallbackUrl }
    }
    return { commonName, media }
  })().catch((): TaxonPresentation => ({}))
  cache.set(taxonKey, request)
  void request.then((presentation) => { if (!presentation.commonName && !presentation.media) cache.delete(taxonKey) })
  return request
}
