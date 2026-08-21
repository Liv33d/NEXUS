import { Cloud, CloudDrizzle, CloudLightning, CloudRain, CloudSun, Droplets, Snowflake, Sun, Wind } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  displayPrecipitation,
  displayTemperature,
  displayWindSpeed,
  formatObserverWallTime,
  weatherCodeLabel,
  type DailyForecastDay,
  type HourlyForecastPoint,
  type TemperatureUnit,
} from '../providers/openMeteo'

function WeatherGlyph({ code }: { code: number }) {
  if (code === 0) return <Sun aria-hidden="true" />
  if (code <= 3) return <CloudSun aria-hidden="true" />
  if (code <= 49) return <Cloud aria-hidden="true" />
  if (code <= 59) return <CloudDrizzle aria-hidden="true" />
  if (code <= 69 || (code >= 80 && code <= 84)) return <CloudRain aria-hidden="true" />
  if (code <= 79 || code === 85 || code === 86) return <Snowflake aria-hidden="true" />
  return <CloudLightning aria-hidden="true" />
}

function dayLabel(date: string, locale?: string) {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return date
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)))
}

function hourLabel(point: HourlyForecastPoint, locale?: string) {
  return formatObserverWallTime(point.localTime, locale).replace(':00', '')
}

export function WeatherForecast({ hourly, daily, unit, observedAt, retrievedAt }: {
  hourly: HourlyForecastPoint[]
  daily: DailyForecastDay[]
  unit: TemperatureUnit
  observedAt: number
  retrievedAt: number
}) {
  const [selectedDate, setSelectedDate] = useState<string>()
  const selected = daily.find((day) => day.date === selectedDate)
  const unitMark = unit === 'fahrenheit' ? 'F' : 'C'
  const windUnit = unit === 'fahrenheit' ? 'mph' : 'km/h'
  const precipitationUnit = unit === 'fahrenheit' ? 'in' : 'mm'
  const range = useMemo(() => {
    const values = hourly.map((point) => displayTemperature(point.temperature, unit))
    return { min: Math.min(...values), max: Math.max(...values) }
  }, [hourly, unit])

  return <section className="weather-forecast" aria-label="Local weather forecast">
    <header className="weather-section-heading">
      <div><span>ATMOSPHERE</span><h2>Next 24 hours</h2></div>
      <small>FORECAST · OPEN-METEO</small>
    </header>
    {hourly.length ? <div className="hourly-scroll" tabIndex={0} aria-label="Scrollable hourly forecast">
      <div className="hourly-track" style={{ '--hour-count': hourly.length } as React.CSSProperties}>
        {hourly.map((point, index) => {
          const temperature = displayTemperature(point.temperature, unit)
          const spread = Math.max(1, range.max - range.min)
          const temperaturePosition = 18 + (range.max - temperature) / spread * 34
          const probability = Math.max(0, Math.min(100, point.precipitationProbability ?? 0))
          return <article className="hourly-point" key={`${point.localTime}-${index}`} aria-label={`${hourLabel(point)}: ${weatherCodeLabel(point.weatherCode)}, ${Math.round(temperature)} degrees ${unitMark}, ${probability} percent precipitation`}>
            <time>{index === 0 ? 'NOW' : hourLabel(point)}</time>
            <WeatherGlyph code={point.weatherCode}/>
            <span className="hour-temperature" style={{ top: `${temperaturePosition}px` }}>{Math.round(temperature)}°</span>
            <i className="precip-bar" style={{ height: `${Math.max(2, probability * .34)}px` }}/>
            <small>{probability ? `${probability}%` : '—'}</small>
          </article>
        })}
      </div>
    </div> : <p className="quiet-copy">The hourly model is temporarily unavailable. Current conditions remain visible.</p>}
    <div className="weather-method"><span>MODEL FORECAST</span><small>Conditions are forecast—not observations. Current conditions time: {new Date(observedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Retrieved {new Date(retrievedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</small></div>

    <header className="weather-section-heading five-day-heading">
      <div><span>OUTLOOK</span><h2>Five days</h2></div>
      <small>TAP A DAY</small>
    </header>
    <div className="daily-forecast">
      {daily.map((day, index) => {
        const active = day.date === selectedDate
        return <button key={day.date} className={active ? 'active' : ''} aria-expanded={active} onClick={() => setSelectedDate(active ? undefined : day.date)}>
          <time>{index === 0 ? 'Today' : dayLabel(day.date)}</time>
          <WeatherGlyph code={day.weatherCode}/>
          <span className="daily-condition">{weatherCodeLabel(day.weatherCode)}</span>
          <span className="daily-precip"><Droplets/>{day.precipitationProbability ?? 0}%</span>
          <strong>{Math.round(displayTemperature(day.temperatureMax, unit))}° <i>{Math.round(displayTemperature(day.temperatureMin, unit))}°</i></strong>
        </button>
      })}
    </div>
    {selected && <div className="daily-detail">
      <div><CloudRain/><span>Precipitation<strong>{displayPrecipitation(selected.precipitation ?? 0, unit).toFixed(unit === 'fahrenheit' ? 2 : 1)} {precipitationUnit}</strong></span></div>
      <div><Wind/><span>Peak wind<strong>{selected.windSpeedMax === undefined ? '—' : `${Math.round(displayWindSpeed(selected.windSpeedMax, unit))} ${windUnit}`}</strong></span></div>
      <div><Sun/><span>Daylight<strong>{selected.sunrise && selected.sunset ? `${formatObserverWallTime(selected.sunrise)}–${formatObserverWallTime(selected.sunset)}` : '—'}</strong></span></div>
    </div>}
  </section>
}
