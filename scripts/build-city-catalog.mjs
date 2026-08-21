import { writeFile } from 'node:fs/promises'

const source = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson'
const response = await fetch(source, { signal: AbortSignal.timeout(30_000) })
if (!response.ok) throw new Error(`Natural Earth returned ${response.status}`)
const collection = await response.json()
const cities = collection.features
  .map((feature) => ({
    name: String(feature.properties.nameascii || feature.properties.name), country: String(feature.properties.adm0name || ''),
    lat: Number(feature.geometry.coordinates[1].toFixed(5)), lng: Number(feature.geometry.coordinates[0].toFixed(5)),
    population: Number(feature.properties.pop_max || 0), capital: Number(feature.properties.adm0cap || 0) === 1, minZoom: Number(feature.properties.min_zoom || 4),
  }))
  .filter((city) => Number.isFinite(city.lat) && Number.isFinite(city.lng) && (city.population >= 100_000 || city.capital))
  .sort((a, b) => Number(b.capital) - Number(a.capital) || b.population - a.population)
const output = `// Generated from Natural Earth 1:10m populated places (public domain).\n// Cities under 100,000 residents are omitted unless they are national capitals.\nexport interface GlobeCity { name: string; country: string; lat: number; lng: number; population: number; capital: boolean; minZoom: number }\n\nexport const GLOBE_CITIES: GlobeCity[] = ${JSON.stringify(cities)}\n`
await writeFile(new URL('../src/data/cities.ts', import.meta.url), output)
console.log(`Wrote ${cities.length} zoom-aware globe places`)
