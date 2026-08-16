import { z } from 'zod'
import { fetchWithTimeout, providerHttpError } from './types'

const weatherSchema = z.object({
  latitude: z.number(), longitude: z.number(), timezone: z.string(),
  current: z.object({
    time: z.string(), temperature_2m: z.number(), apparent_temperature: z.number(), precipitation: z.number(),
    weather_code: z.number(), cloud_cover: z.number(), surface_pressure: z.number(), wind_speed_10m: z.number(), wind_direction_10m: z.number(),
  }),
  daily: z.object({ sunrise: z.array(z.string()).min(1), sunset: z.array(z.string()).min(1) }),
})

const airSchema = z.object({ current: z.object({ time: z.string(), us_aqi: z.number().nullable(), pm2_5: z.number().nullable() }) })
const geocodingSchema = z.object({ results: z.array(z.object({
  id: z.number(), name: z.string(), latitude: z.number(), longitude: z.number(),
  country: z.string().optional(), country_code: z.string().optional(),
  admin1: z.string().optional(), admin2: z.string().optional(), admin3: z.string().optional(), admin4: z.string().optional(),
  timezone: z.string().optional(), feature_code: z.string().optional(), population: z.number().optional(),
})).optional() })

type GeocodingResult = z.infer<typeof geocodingSchema>['results'] extends Array<infer Result> | undefined ? Result : never

const usRegions: Record<string, string> = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California', CO:'Colorado', CT:'Connecticut', DE:'Delaware', FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky', LA:'Louisiana', ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan', MN:'Minnesota', MS:'Mississippi', MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada', NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico', NY:'New York', NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina', SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont', VA:'Virginia', WA:'Washington', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming', DC:'District of Columbia',
}
const usTerritories: Record<string, string> = { PR:'Puerto Rico', VI:'U.S. Virgin Islands', GU:'Guam', AS:'American Samoa', MP:'Northern Mariana Islands' }
const normalizedText = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const uniqueLabels = (values: Array<string | undefined>, excluded: string[] = []) => {
  const seen = new Set(excluded.map(normalizedText))
  return values.filter((value): value is string => {
    if (!value?.trim()) return false
    const key = normalizedText(value)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function dedupeLocationLabel(value: string): string {
  return uniqueLabels(value.split(',').map((part) => part.trim())).join(', ')
}

export function observerPlaceSubtitle(place: Pick<GeocodingResult, 'name' | 'admin1' | 'admin2' | 'admin3' | 'admin4' | 'country' | 'country_code'>): string {
  const localityKey = normalizedText(place.name)
  const genericAdminWords = /\b(city|county|district|municipality|municipio|borough|parish|prefecture|province|region|stadt|departement|department|departamento)\b/g
  const administrative = uniqueLabels([place.admin1, place.admin2, place.admin3, place.admin4], [place.name]).filter((value) => normalizedText(value).replace(genericAdminWords, '').replace(/\s+/g, ' ').trim() !== localityKey)
  const country = uniqueLabels([place.country ?? place.country_code], [place.name, ...administrative])[0]
  // The first administrative level is the most recognizable disambiguator worldwide.
  return uniqueLabels([administrative[0], country], [place.name]).join(', ')
}

export function parseObserverPlaceQuery(query: string) {
  const parts = query.split(',').map((part) => part.trim()).filter(Boolean)
  const name = parts.shift() ?? query.trim()
  let qualifiers = parts
  let countryCode: string | undefined
  const suffix = qualifiers.at(-1)?.toUpperCase()
  if (suffix && usRegions[suffix]) { countryCode = 'US'; qualifiers = [...qualifiers.slice(0, -1), usRegions[suffix]!] }
  else if (suffix && usTerritories[suffix]) { countryCode = suffix; qualifiers = [...qualifiers.slice(0, -1), usTerritories[suffix]!] }
  else if (suffix?.length === 2) {
    try {
      const regionName = new Intl.DisplayNames(['en'], { type: 'region' }).of(suffix)
      if (regionName && regionName !== suffix) { countryCode = suffix; qualifiers = [...qualifiers.slice(0, -1), regionName] }
    } catch { /* Older Safari: rank by the literal qualifier. */ }
  }
  return { name, qualifiers: qualifiers.map(normalizedText), countryCode }
}

export interface ObserverPlace {
  id: number | string
  name: string
  subtitle: string
  latitude: number
  longitude: number
  timezone?: string
}

export async function searchObserverPlaces(query: string, signal?: AbortSignal): Promise<ObserverPlace[]> {
  const normalized = query.trim()
  if (normalized.length < 2) return []
  const parsedQuery = parseObserverPlaceQuery(normalized)
  const params = new URLSearchParams({ name: parsedQuery.name, count: '20', language: navigator.language?.split('-')[0] || 'en', format: 'json' })
  if (parsedQuery.countryCode) params.set('countryCode', parsedQuery.countryCode)
  const response = await fetchWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?${params}`, { signal }, 6500)
  if (!response.ok) throw providerHttpError(response, 'open-meteo-geocoding')
  const payload = geocodingSchema.parse(await response.json())
  const ranked = (payload.results ?? []).map((place) => {
    const subtitle = observerPlaceSubtitle(place)
    const searchable = normalizedText([place.name, place.admin1, place.admin2, place.admin3, place.admin4, place.country, place.country_code].filter(Boolean).join(' '))
    const qualifierScore = parsedQuery.qualifiers.reduce((score, term) => score + (searchable.includes(term) ? 20 : -8), 0)
    const exactScore = normalizedText(place.name) === normalizedText(parsedQuery.name) ? 40 : 0
    const populatedScore = Math.min(Math.log10(Math.max(place.population ?? 1, 1)), 8)
    return { place, subtitle, score: qualifierScore + exactScore + populatedScore }
  }).sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name))
  const seen = new Set<string>()
  return ranked.flatMap(({ place, subtitle }) => {
    const key = `${normalizedText(place.name)}|${normalizedText(subtitle)}|${place.latitude.toFixed(3)}|${place.longitude.toFixed(3)}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ id: place.id, name: place.name, subtitle, latitude: place.latitude, longitude: place.longitude, timezone: place.timezone }]
  }).slice(0, 8)
}

export interface ObserverContext {
  temperature: number
  apparentTemperature: number
  precipitation: number
  weatherCode: number
  cloudCover: number
  pressure: number
  windSpeed: number
  windDirection: number
  sunrise: string
  sunset: string
  timezone: string
  aqi?: number
  pm25?: number
  observedAt: number
}

export async function fetchObserverContext(latitude: number, longitude: number, signal?: AbortSignal): Promise<ObserverContext> {
  const weatherParams = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), current: 'temperature_2m,apparent_temperature,precipitation,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m', daily: 'sunrise,sunset', timezone: 'auto', forecast_days: '1' })
  const airParams = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), current: 'us_aqi,pm2_5', timezone: 'auto' })
  const [weatherResponse, airResponse] = await Promise.all([
    fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${weatherParams}`, { signal }, 8000),
    fetchWithTimeout(`https://air-quality-api.open-meteo.com/v1/air-quality?${airParams}`, { signal }, 8000),
  ])
  if (!weatherResponse.ok) throw providerHttpError(weatherResponse, 'open-meteo')
  const weather = weatherSchema.parse(await weatherResponse.json())
  const air = airResponse.ok ? airSchema.safeParse(await airResponse.json()) : undefined
  return {
    temperature: weather.current.temperature_2m,
    apparentTemperature: weather.current.apparent_temperature,
    precipitation: weather.current.precipitation,
    weatherCode: weather.current.weather_code,
    cloudCover: weather.current.cloud_cover,
    pressure: weather.current.surface_pressure,
    windSpeed: weather.current.wind_speed_10m,
    windDirection: weather.current.wind_direction_10m,
    sunrise: weather.daily.sunrise[0]!,
    sunset: weather.daily.sunset[0]!,
    timezone: weather.timezone,
    aqi: air?.success ? air.data.current.us_aqi ?? undefined : undefined,
    pm25: air?.success ? air.data.current.pm2_5 ?? undefined : undefined,
    observedAt: Date.parse(weather.current.time),
  }
}

export function weatherCodeLabel(code: number): string {
  if (code === 0) return 'Clear'
  if (code <= 3) return 'Cloudy'
  if (code <= 49) return 'Fog'
  if (code <= 69) return 'Rain'
  if (code <= 79) return 'Snow'
  if (code <= 84) return 'Showers'
  if (code <= 94) return 'Storms'
  return 'Thunderstorms'
}

export type TemperatureUnit = 'celsius' | 'fahrenheit'

export function displayTemperature(celsius: number, unit: TemperatureUnit): number {
  return unit === 'fahrenheit' ? celsius * 9 / 5 + 32 : celsius
}

export function displayWindSpeed(kmh: number, unit: TemperatureUnit): number {
  return unit === 'fahrenheit' ? kmh * 0.621371 : kmh
}

export function formatObserverWallTime(value: string, locale?: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(value)
  if (!match) return '—'
  const instant = new Date(Date.UTC(2000, 0, 1, Number(match[1]), Number(match[2])))
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(instant)
}
