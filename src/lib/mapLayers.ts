import type { FeatureCollection, LineString } from 'geojson'
import type { Map as MapLibreMap } from 'maplibre-gl'

type MapStyle = Exclude<Parameters<MapLibreMap['setStyle']>[0], string | null>

/**
 * A zero-network geographic base used while the detailed vector style loads.
 * The source is Natural Earth 1:110m country geometry bundled with the app.
 * Do not use a single world image source here: an image spanning the date line
 * is triangulated in Web Mercator and creates severe antimeridian seams.
 */
export function fallbackMapStyle(assetBase = './'): MapStyle {
  return {
    version: 8,
    name: 'NEXUS resilient Earth',
    sources: {
      'nexus-natural-earth': {
        type: 'geojson',
        data: `${assetBase}natural-earth-110m-countries.geojson`,
        attribution: 'Natural Earth',
      },
    },
    layers: [
      { id: 'nexus-ocean', type: 'background', paint: { 'background-color': '#010708' } },
      {
        id: 'nexus-land-shadow',
        type: 'fill',
        source: 'nexus-natural-earth',
        paint: {
          'fill-color': '#112326',
          'fill-outline-color': 'rgba(147, 211, 207, 0.58)',
        },
      },
      {
        id: 'nexus-country-borders',
        type: 'line',
        source: 'nexus-natural-earth',
        paint: {
          'line-color': 'rgba(137, 190, 188, 0.46)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 0.2, 0.58, 6, 1],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 0.2, 0.82, 5, 0.38],
        },
      },
    ],
  }
}

export function worldGridGeoJSON(): FeatureCollection<LineString> {
  const features: FeatureCollection<LineString>['features'] = []
  for (let longitude = -150; longitude <= 150; longitude += 30) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: Array.from({ length: 35 }, (_, index) => [longitude, -85 + index * 5]) },
    })
  }
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: Array.from({ length: 73 }, (_, index) => [-180 + index * 5, latitude]) },
    })
  }
  return { type: 'FeatureCollection', features }
}

const NOAA_RADAR_EXPORT = 'https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity/MapServer/export'
const NOAA_GEOCOLOR_EXPORT = 'https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/MERGED_GeoColor/ImageServer/exportImage'
export const RADAR_FRAME_STEP_MS = 10 * 60_000

export function radarFrames(reference = Date.now(), count = 10): number[] {
  const safeCount = Math.max(1, Math.min(25, Math.floor(count)))
  const latest = Math.floor((reference - RADAR_FRAME_STEP_MS) / RADAR_FRAME_STEP_MS) * RADAR_FRAME_STEP_MS
  return Array.from({ length: safeCount }, (_, index) => latest - (safeCount - index - 1) * RADAR_FRAME_STEP_MS)
}

/**
 * Returns a single, georeferenced equirectangular radar image. The previous
 * implementation exposed an ArcGIS bbox placeholder to a renderer that never
 * substituted it, so every request failed. NOAA marks this service as current
 * (not time enabled), therefore the rounded cache token is only used to refresh
 * the image at the provider's documented five-minute cadence.
 */
export function noaaRadarImage(reference = Date.now(), width = 2048, height = 1024) {
  const cacheToken = Math.floor(reference / (5 * 60_000))
  const params = new URLSearchParams({
    bbox: '-180,-90,180,90',
    bboxSR: '4326',
    imageSR: '4326',
    size: `${Math.min(4096, Math.max(256, width))},${Math.min(4096, Math.max(128, height))}`,
    dpi: '96',
    format: 'png32',
    transparent: 'true',
    layers: 'show:3',
    f: 'image',
    v: String(cacheToken),
  })
  return `${NOAA_RADAR_EXPORT}?${params}`
}

/** @deprecated Use noaaRadarImage. Retained for cached callers during PWA upgrades. */
export const noaaRadarTiles = noaaRadarImage

/** Latest merged GOES-East/West GeoColor, reprojected by NOAA to WGS84. */
export function noaaGeoColorImage(reference = Date.now(), width = 2048, height = 1024) {
  const cacheToken = Math.floor(reference / (10 * 60_000))
  const params = new URLSearchParams({
    bbox: '-180,-90,180,90', bboxSR: '4326', imageSR: '4326',
    size: `${Math.min(4096, Math.max(256, width))},${Math.min(4096, Math.max(128, height))}`,
    format: 'png32', transparent: 'true', interpolation: 'RSP_BilinearInterpolation', f: 'image', v: String(cacheToken),
  })
  return `${NOAA_GEOCOLOR_EXPORT}?${params}`
}

export function previousUtcDate(reference = Date.now()) {
  return new Date(reference - 86_400_000).toISOString().slice(0, 10)
}

export function nasaTrueColorTiles(reference = Date.now()) {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${previousUtcDate(reference)}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`
}

export const environmentalLayers = {
  radar: {
    label: 'NOAA/NWS MRMS base reflectivity',
    freshness: 'Current quality-controlled composite; approximately 5-minute source updates',
    coverage: 'United States and nearby radar domains',
    attribution: 'Radar: NOAA/NWS MRMS',
  },
  satellite: {
    label: 'NOAA NESDIS merged GOES GeoColor',
    freshness: 'Latest operational image; normally refreshed every 10–15 minutes',
    coverage: 'GOES East and West domains, approximately 76°S to 76°N',
    attribution: 'Imagery: NOAA/NESDIS/STAR',
  },
} as const
