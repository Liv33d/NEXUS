import { z } from 'zod'
import { fetchWithTimeout, providerHttpError } from './types'

const weatherSchema = z.object({
  latitude: z.number(), longitude: z.number(), timezone: z.string(), utc_offset_seconds: z.number().default(0),
  current: z.object({
    time: z.string(), temperature_2m: z.number(), apparent_temperature: z.number(), precipitation: z.number(),
    weather_code: z.number(), cloud_cover: z.number(), surface_pressure: z.number(), wind_speed_10m: z.number(), wind_direction_10m: z.number(),
    relative_humidity_2m: z.number().nullable().optional(), visibility: z.number().nullable().optional(), is_day: z.number().optional(),
  }),
  hourly: z.object({
    time: z.array(z.string()), temperature_2m: z.array(z.number().nullable()), apparent_temperature: z.array(z.number().nullable()),
    precipitation_probability: z.array(z.number().nullable()), precipitation: z.array(z.number().nullable()),
    rain: z.array(z.number().nullable()), snowfall: z.array(z.number().nullable()), weather_code: z.array(z.number().nullable()),
    cloud_cover: z.array(z.number().nullable()), wind_speed_10m: z.array(z.number().nullable()), wind_direction_10m: z.array(z.number().nullable()),
  }).optional(),
  daily: z.object({
    time: z.array(z.string()).optional(), sunrise: z.array(z.string()).min(1), sunset: z.array(z.string()).min(1),
    weather_code: z.array(z.number().nullable()).optional(), temperature_2m_max: z.array(z.number().nullable()).optional(),
    temperature_2m_min: z.array(z.number().nullable()).optional(), precipitation_probability_max: z.array(z.number().nullable()).optional(),
    precipitation_sum: z.array(z.number().nullable()).optional(), wind_speed_10m_max: z.array(z.number().nullable()).optional(),
  }),
})

const airSchema = z.object({ current: z.object({ time: z.string(), us_aqi: z.number().nullable(), pm2_5: z.number().nullable() }) })
const marineSchema = z.object({
  latitude: z.number(), longitude: z.number(),
  current: z.object({
    time: z.string(), wave_height: z.number().nullable(), wave_direction: z.number().nullable(), wave_period: z.number().nullable(),
    sea_surface_temperature: z.number().nullable(), ocean_current_velocity: z.number().nullable(), ocean_current_direction: z.number().nullable(),
  }),
})
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
  const genericAdminWords = /\b(city|county|district|municipality|municipio|borough|barrio|ward|township|commune|parish|prefecture|province|region|stadt|departement|department|departamento)\b/g
  const sublocalityWords = /\b(barrio|ward|township|commune)\b/
  const administrative = uniqueLabels([place.admin1, place.admin2, place.admin3, place.admin4], [place.name]).filter((value) => {
    const normalized = normalizedText(value)
    return !sublocalityWords.test(normalized) && normalized.replace(genericAdminWords, '').replace(/\s+/g, ' ').trim() !== localityKey
  })
  let country = place.country ?? place.country_code
  const code = place.country_code?.toUpperCase() ?? (country?.length === 2 ? country.toUpperCase() : undefined)
  if (code && (!country || country.toUpperCase() === code)) {
    try { country = new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? country } catch { /* Retain provider label on older Safari. */ }
  }
  const countryLabel = uniqueLabels([country], [place.name, ...administrative])[0]
  // The first administrative level is the most recognizable disambiguator worldwide.
  return uniqueLabels([administrative[0], countryLabel], [place.name]).join(', ')
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
  watching?: boolean
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
  relativeHumidity?: number
  visibility?: number
  isDay?: boolean
  sunrise: string
  sunset: string
  timezone: string
  aqi?: number
  pm25?: number
  observedAt: number
  retrievedAt: number
  hourly24: HourlyForecastPoint[]
  daily5: DailyForecastDay[]
}

export interface HourlyForecastPoint {
  timestamp: number
  localTime: string
  temperature: number
  apparentTemperature?: number
  precipitationProbability?: number
  precipitation?: number
  rain?: number
  snowfall?: number
  weatherCode: number
  cloudCover?: number
  windSpeed?: number
  windDirection?: number
}

export interface DailyForecastDay {
  date: string
  weatherCode: number
  temperatureMax: number
  temperatureMin: number
  precipitationProbability?: number
  precipitation?: number
  windSpeedMax?: number
  sunrise?: string
  sunset?: string
}

export interface MarineContext {
  waveHeight?: number
  waveDirection?: number
  wavePeriod?: number
  seaSurfaceTemperature?: number
  currentVelocity?: number
  currentDirection?: number
  gridLatitude: number
  gridLongitude: number
  observedAt: number
}

export async function fetchObserverContext(latitude: number, longitude: number, signal?: AbortSignal): Promise<ObserverContext> {
  const weatherParams = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m,visibility,is_day',
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,rain,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset',
    timezone: 'auto', forecast_days: '6',
  })
  const airParams = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), current: 'us_aqi,pm2_5', timezone: 'auto' })
  const [weatherResponse, airResponse] = await Promise.all([
    fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${weatherParams}`, { signal }, 8000),
    fetchWithTimeout(`https://air-quality-api.open-meteo.com/v1/air-quality?${airParams}`, { signal }, 8000),
  ])
  if (!weatherResponse.ok) throw providerHttpError(weatherResponse, 'open-meteo')
  const weather = weatherSchema.parse(await weatherResponse.json())
  const air = airResponse.ok ? airSchema.safeParse(await airResponse.json()) : undefined
  const parseLocalTime = (value: string) => Date.parse(`${value}Z`) - weather.utc_offset_seconds * 1000
  const observedAt = parseLocalTime(weather.current.time)
  const hourly24 = (weather.hourly?.time ?? []).map((localTime, index): HourlyForecastPoint | undefined => {
    const temperature = weather.hourly?.temperature_2m[index]
    const weatherCode = weather.hourly?.weather_code[index]
    if (temperature == null || weatherCode == null) return undefined
    return {
      timestamp: parseLocalTime(localTime), localTime, temperature, weatherCode,
      apparentTemperature: weather.hourly?.apparent_temperature[index] ?? undefined,
      precipitationProbability: weather.hourly?.precipitation_probability[index] ?? undefined,
      precipitation: weather.hourly?.precipitation[index] ?? undefined,
      rain: weather.hourly?.rain[index] ?? undefined,
      snowfall: weather.hourly?.snowfall[index] ?? undefined,
      cloudCover: weather.hourly?.cloud_cover[index] ?? undefined,
      windSpeed: weather.hourly?.wind_speed_10m[index] ?? undefined,
      windDirection: weather.hourly?.wind_direction_10m[index] ?? undefined,
    }
  }).filter((point): point is HourlyForecastPoint => Boolean(point && point.timestamp >= observedAt - 30 * 60_000)).slice(0, 24)
  const daily5 = (weather.daily.time ?? []).map((date, index): DailyForecastDay | undefined => {
    const weatherCode = weather.daily.weather_code?.[index]
    const temperatureMax = weather.daily.temperature_2m_max?.[index]
    const temperatureMin = weather.daily.temperature_2m_min?.[index]
    if (weatherCode == null || temperatureMax == null || temperatureMin == null) return undefined
    return {
      date, weatherCode, temperatureMax, temperatureMin,
      precipitationProbability: weather.daily.precipitation_probability_max?.[index] ?? undefined,
      precipitation: weather.daily.precipitation_sum?.[index] ?? undefined,
      windSpeedMax: weather.daily.wind_speed_10m_max?.[index] ?? undefined,
      sunrise: weather.daily.sunrise[index], sunset: weather.daily.sunset[index],
    }
  }).filter((day): day is DailyForecastDay => Boolean(day)).slice(0, 5)
  return {
    temperature: weather.current.temperature_2m,
    apparentTemperature: weather.current.apparent_temperature,
    precipitation: weather.current.precipitation,
    weatherCode: weather.current.weather_code,
    cloudCover: weather.current.cloud_cover,
    pressure: weather.current.surface_pressure,
    windSpeed: weather.current.wind_speed_10m,
    windDirection: weather.current.wind_direction_10m,
    relativeHumidity: weather.current.relative_humidity_2m ?? undefined,
    visibility: weather.current.visibility ?? undefined,
    isDay: weather.current.is_day === undefined ? undefined : weather.current.is_day === 1,
    sunrise: weather.daily.sunrise[0]!,
    sunset: weather.daily.sunset[0]!,
    timezone: weather.timezone,
    aqi: air?.success ? air.data.current.us_aqi ?? undefined : undefined,
    pm25: air?.success ? air.data.current.pm2_5 ?? undefined : undefined,
    observedAt,
    retrievedAt: Date.now(),
    hourly24,
    daily5,
  }
}

export async function fetchMarineContext(latitude: number, longitude: number, signal?: AbortSignal): Promise<MarineContext | undefined> {
  const params = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude),
    current: 'wave_height,wave_direction,wave_period,sea_surface_temperature,ocean_current_velocity,ocean_current_direction',
    cell_selection: 'sea', timezone: 'GMT', forecast_days: '1',
  })
  const response = await fetchWithTimeout(`https://marine-api.open-meteo.com/v1/marine?${params}`, { signal }, 8000)
  if (!response.ok) throw providerHttpError(response, 'open-meteo-marine')
  const value = marineSchema.parse(await response.json())
  const current = value.current
  if ([current.wave_height, current.sea_surface_temperature, current.ocean_current_velocity].every((item) => item === null)) return undefined
  return {
    waveHeight: current.wave_height ?? undefined,
    waveDirection: current.wave_direction ?? undefined,
    wavePeriod: current.wave_period ?? undefined,
    seaSurfaceTemperature: current.sea_surface_temperature ?? undefined,
    currentVelocity: current.ocean_current_velocity ?? undefined,
    currentDirection: current.ocean_current_direction ?? undefined,
    gridLatitude: value.latitude,
    gridLongitude: value.longitude,
    observedAt: Date.parse(`${current.time}Z`),
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

export function observerWeatherSummary(context: ObserverContext): string {
  const nextRain = context.hourly24.find((point) => (point.precipitationProbability ?? 0) >= 60)
  const rainPeak = Math.max(0, ...context.hourly24.map((point) => point.precipitationProbability ?? 0))
  const windPeak = Math.max(context.windSpeed, ...context.hourly24.map((point) => point.windSpeed ?? 0))
  const parts = [`${weatherCodeLabel(context.weatherCode)} now`]
  if (nextRain) parts.push(`rain becomes likely around ${new Date(nextRain.timestamp).toLocaleTimeString([], { hour: 'numeric' })}, peaking near ${Math.round(rainPeak)}%`)
  else if (rainPeak >= 30) parts.push('a smaller chance of rain develops later')
  else parts.push('rain is unlikely during the next 24 hours')
  if (windPeak >= 50) parts.push(`winds may become strong, reaching about ${Math.round(windPeak)} km/h`)
  if (context.aqi !== undefined && context.aqi >= 101) parts.push('air quality may be unhealthy for sensitive groups')
  return `${parts.join('. ')}.`
}

export type TemperatureUnit = 'celsius' | 'fahrenheit'

export function displayTemperature(celsius: number, unit: TemperatureUnit): number {
  return unit === 'fahrenheit' ? celsius * 9 / 5 + 32 : celsius
}

export function displayWindSpeed(kmh: number, unit: TemperatureUnit): number {
  return unit === 'fahrenheit' ? kmh * 0.621371 : kmh
}

export function displayPrecipitation(mm: number, unit: TemperatureUnit): number {
  return unit === 'fahrenheit' ? mm / 25.4 : mm
}

export function displayVisibility(meters: number, unit: TemperatureUnit): number {
  return unit === 'fahrenheit' ? meters / 1609.344 : meters / 1000
}

export function displayPressure(hPa: number, unit: TemperatureUnit): number {
  return unit === 'fahrenheit' ? hPa * 0.0295299830714 : hPa
}

export function formatObserverWallTime(value: string, locale?: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(value)
  if (!match) return '—'
  const instant = new Date(Date.UTC(2000, 0, 1, Number(match[1]), Number(match[2])))
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(instant)
}
