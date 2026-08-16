import type { FeatureCollection, LineString } from 'geojson'
import type { Map as MapLibreMap } from 'maplibre-gl'

type MapStyle = Exclude<Parameters<MapLibreMap['setStyle']>[0], string | null>

export const OPEN_FREE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark'

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
      { id: 'nexus-ocean', type: 'background', paint: { 'background-color': '#020607' } },
      {
        id: 'nexus-land-shadow',
        type: 'fill',
        source: 'nexus-natural-earth',
        paint: {
          'fill-color': '#0a1415',
          'fill-outline-color': 'rgba(117, 173, 170, 0.24)',
        },
      },
      {
        id: 'nexus-country-borders',
        type: 'line',
        source: 'nexus-natural-earth',
        paint: {
          'line-color': 'rgba(136, 183, 180, 0.24)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 0.8, 0.42, 6, 0.9],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 0.8, 0.58, 5, 0.28],
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

const NOAA_RADAR_BASE = 'https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity_time/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image'
export const RADAR_FRAME_STEP_MS = 10 * 60_000

export function radarFrames(reference = Date.now(), count = 10): number[] {
  const safeCount = Math.max(1, Math.min(25, Math.floor(count)))
  const latest = Math.floor((reference - RADAR_FRAME_STEP_MS) / RADAR_FRAME_STEP_MS) * RADAR_FRAME_STEP_MS
  return Array.from({ length: safeCount }, (_, index) => latest - (safeCount - index - 1) * RADAR_FRAME_STEP_MS)
}

export function noaaRadarTiles(timestamp = radarFrames(Date.now(), 1)[0]!) {
  return `${NOAA_RADAR_BASE}&time=${timestamp}`
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
    freshness: 'Four-hour time-enabled service; approximately 5-minute source updates',
    coverage: 'United States and nearby radar domains',
    attribution: 'Radar: NOAA/NWS MRMS',
  },
  satellite: {
    label: 'NASA MODIS Terra corrected-reflectance true color',
    freshness: 'Previous completed UTC day',
    coverage: 'Global where observations are available',
    attribution: 'Imagery: NASA EOSDIS GIBS',
  },
} as const
