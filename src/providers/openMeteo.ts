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
  country: z.string().optional(), admin1: z.string().optional(), timezone: z.string().optional(),
})).optional() })

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
  const params = new URLSearchParams({ name: normalized, count: '6', language: navigator.language?.split('-')[0] || 'en', format: 'json' })
  const response = await fetchWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?${params}`, { signal }, 6500)
  if (!response.ok) throw providerHttpError(response, 'open-meteo-geocoding')
  const payload = geocodingSchema.parse(await response.json())
  return (payload.results ?? []).map((place) => ({
    id: place.id,
    name: place.name,
    subtitle: [place.admin1, place.country].filter(Boolean).join(', '),
    latitude: place.latitude,
    longitude: place.longitude,
    timezone: place.timezone,
  }))
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
