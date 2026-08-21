import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { unzipSync, strFromU8 } from 'fflate'

const dataDir = new URL('../public/data/', import.meta.url)
await mkdir(dataDir, { recursive: true })

const decodeXml = (value) => value.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').trim()
const textTag = (xml, name) => decodeXml(new RegExp(`<${name}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`, 'i').exec(xml)?.[1] ?? '')
const coordinates = (value) => value.trim().split(/\s+/).flatMap((tuple) => {
  const [longitude, latitude] = tuple.split(',').map(Number)
  return Number.isFinite(longitude) && Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? [[longitude, latitude]] : []
})

function clipAt(ring, boundary, keepLower) {
  const inside = ([longitude]) => keepLower ? longitude <= boundary : longitude >= boundary
  const result = []
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]
    const previous = ring[(index + ring.length - 1) % ring.length]
    const currentInside = inside(current)
    const previousInside = inside(previous)
    if (currentInside !== previousInside) {
      const ratio = (boundary - previous[0]) / (current[0] - previous[0])
      result.push([boundary, previous[1] + ratio * (current[1] - previous[1])])
    }
    if (currentInside) result.push(current)
  }
  if (result.length && (result[0][0] !== result.at(-1)[0] || result[0][1] !== result.at(-1)[1])) result.push([...result[0]])
  return result
}

function polygonGeometry(sourceRing) {
  const ring = []
  for (const point of sourceRing) {
    if (!ring.length) { ring.push([...point]); continue }
    let longitude = point[0]
    const previous = ring.at(-1)[0]
    while (longitude - previous > 180) longitude -= 360
    while (longitude - previous < -180) longitude += 360
    ring.push([longitude, point[1]])
  }
  while (Math.min(...ring.map(([longitude]) => longitude)) < -180) ring.forEach((point) => { point[0] += 360 })
  if (Math.max(...ring.map(([longitude]) => longitude)) <= 180) return { type: 'Polygon', coordinates: [ring] }
  const west = clipAt(ring, 180, true)
  const east = clipAt(ring, 180, false).map(([longitude, latitude]) => [longitude - 360, latitude])
  return west.length >= 4 && east.length >= 4 ? { type: 'MultiPolygon', coordinates: [[west], [east]] } : { type: 'Polygon', coordinates: [sourceRing] }
}

async function fetchBytes(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'NEXUS-GitHub-Pages/1.0 (+https://github.com/Liv33d/NEXUS)' }, signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function fetchKml(url) {
  const bytes = await fetchBytes(url)
  if (!url.toLowerCase().endsWith('.kmz')) return new TextDecoder().decode(bytes)
  const files = unzipSync(bytes)
  const entry = Object.entries(files).find(([name]) => name.toLowerCase().endsWith('.kml'))
  if (!entry) throw new Error(`No KML document in ${url}`)
  return strFromU8(entry[1])
}

async function updateCyclones() {
  const rootUrl = 'https://www.nhc.noaa.gov/gis/kml/nhc_active.kml'
  const root = await fetchKml(rootUrl)
  const links = [...root.matchAll(/<NetworkLink[\s\S]*?<\/NetworkLink>/gi)].flatMap(([block]) => {
    const name = textTag(block, 'name')
    const href = textTag(block, 'href')
    if (!href || !/forecast track|track forecast|cone of uncertainty/i.test(name)) return []
    try { return [{ name, href: new URL(href, rootUrl).href }] } catch { return [] }
  })
  const features = []
  for (const link of links.slice(0, 20)) {
    try {
      const kml = await fetchKml(link.href)
      const stormId = /(?:^|[\/_-])((?:al|ep|cp)\d{2}\d{4})(?:[_.-]|$)/i.exec(link.href)?.[1]?.toLowerCase() ?? `nhc-${features.length}`
      const documentName = textTag(kml, 'name').replace(/\.(?:kml|kmz)$/i, '') || link.name
      const blocks = [...kml.matchAll(/<coordinates[^>]*>([\s\S]*?)<\/coordinates>/gi)].map((match) => coordinates(match[1] ?? '')).filter((items) => items.length > 1)
      const product = /cone/i.test(link.name) ? 'cone' : 'track'
      if (product === 'cone') {
        const ring = blocks.sort((a, b) => b.length - a.length)[0]
        if (!ring || ring.length < 4) continue
        if (ring[0]?.[0] !== ring.at(-1)?.[0] || ring[0]?.[1] !== ring.at(-1)?.[1]) ring.push([...ring[0]])
        features.push({ type: 'Feature', properties: { stormId, name: documentName, product, sourceUrl: link.href }, geometry: polygonGeometry(ring) })
      } else {
        const line = blocks.sort((a, b) => b.length - a.length)[0]
        if (!line) continue
        features.push({ type: 'Feature', properties: { stormId, name: documentName, product, sourceUrl: link.href }, geometry: { type: 'LineString', coordinates: line } })
      }
    } catch (error) { console.warn(`Skipped NHC product: ${error instanceof Error ? error.message : error}`) }
  }
  await writeFile(new URL('nhc-cyclones.json', dataDir), JSON.stringify({ type: 'FeatureCollection', generatedAt: new Date().toISOString(), source: 'NOAA National Hurricane Center active KML feed', features }))
  return features.length
}

async function updateOrbits() {
  const url = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=STATIONS&FORMAT=JSON'
  const response = await fetch(url, { headers: { 'User-Agent': 'NEXUS-GitHub-Pages/1.0 (+https://github.com/Liv33d/NEXUS)' }, signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`CelesTrak returned ${response.status}`)
  const payload = await response.json()
  const preferred = /ISS \(ZARYA\)|CSS \(TIANHE\)|TIANGONG/i
  const objects = Array.isArray(payload) ? payload.filter((item) => item && typeof item === 'object' && preferred.test(String(item.OBJECT_NAME ?? ''))).slice(0, 4) : []
  await writeFile(new URL('orbital-elements.json', dataDir), JSON.stringify({ generatedAt: new Date().toISOString(), source: 'CelesTrak GP OMM JSON', objects }))
  return objects.length
}

async function preserveOnFailure(name, update) {
  try { console.log(`${name}: ${await update()} records`) }
  catch (error) {
    console.warn(`${name} snapshot unavailable: ${error instanceof Error ? error.message : error}`)
    try { await readFile(new URL(name === 'NHC' ? 'nhc-cyclones.json' : 'orbital-elements.json', dataDir)) }
    catch { throw error }
  }
}

await Promise.all([preserveOnFailure('NHC', updateCyclones), preserveOnFailure('CelesTrak', updateOrbits)])
