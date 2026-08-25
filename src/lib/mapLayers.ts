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
export const ENVIRONMENTAL_REFRESH_MS = { radar: 5 * 60_000, satellite: 10 * 60_000 } as const

/** Stable frame keys prevent a visible raster reload unless a provider's
 * documented refresh window has actually advanced. */
export function environmentalFrameReference(layer: keyof typeof ENVIRONMENTAL_REFRESH_MS, reference = Date.now()) {
  const cadence = ENVIRONMENTAL_REFRESH_MS[layer]
  return Math.floor(reference / cadence) * cadence
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

/**
 * ArcGIS export endpoints can act as WMS-like raster tile sources when the
 * renderer substitutes MapLibre's Web Mercator bbox token. This keeps weather
 * pixels registered to the basemap instead of stretching one world image over
 * the antimeridian.
 */
export function noaaRadarTileTemplate(reference = Date.now()) {
  const cacheToken = environmentalFrameReference('radar', reference) / ENVIRONMENTAL_REFRESH_MS.radar
  return `${NOAA_RADAR_EXPORT}?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&dpi=96&format=png32&transparent=true&layers=show:3&f=image&v=${cacheToken}`
}

export function noaaGeoColorTileTemplate(reference = Date.now()) {
  const cacheToken = environmentalFrameReference('satellite', reference) / ENVIRONMENTAL_REFRESH_MS.satellite
  return `${NOAA_GEOCOLOR_EXPORT}?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&interpolation=RSP_BilinearInterpolation&f=image&v=${cacheToken}`
}

export function previousUtcDate(reference = Date.now()) {
  return new Date(reference - 86_400_000).toISOString().slice(0, 10)
}

export function nasaTrueColorTiles(reference = Date.now()) {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${previousUtcDate(reference)}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`
}

/** Exact UTC daily observation requested by historical replay. Unlike the
 * latest-complete helper above, this must never silently shift the chosen day. */
export function nasaTrueColorTilesForDate(reference: number) {
  const date = new Date(reference).toISOString().slice(0, 10)
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`
}

/**
 * Global daily observed true-colour imagery for extracting a cloud layer on
 * the sphere. GIBS provides a complete equirectangular image, avoiding the
 * hard GOES sector/no-data wedges that previously crossed the globe.
 */
export function nasaObservedCloudImage(reference = Date.now(), width = 2048, height = 1024) {
  const params = new URLSearchParams({
    service: 'WMS', request: 'GetMap', version: '1.1.1',
    layers: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', styles: '', format: 'image/jpeg', transparent: 'false',
    width: String(Math.min(4096, Math.max(256, width))), height: String(Math.min(2048, Math.max(128, height))),
    srs: 'EPSG:4326', bbox: '-180,-90,180,90', time: previousUtcDate(reference),
  })
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params}`
}

export interface EnvironmentalLayerStamp {
  timestamp: number
  kind: 'observed' | 'retrieved'
  ageMinutes: number
}

export function environmentalLayerStamp(layer: 'radar' | 'satellite', reference = Date.now()): EnvironmentalLayerStamp {
  // Both rendered NOAA services expose their latest product rather than a
  // selectable observation time. NEXUS can truthfully state when it refreshed
  // the image, but must not manufacture a sensor timestamp.
  const timestamp = environmentalFrameReference(layer, reference)
  return { timestamp, kind: 'retrieved', ageMinutes: Math.max(0, Math.floor((reference - timestamp) / 60_000)) }
}

export const environmentalLayers = {
  radar: {
    label: 'NOAA/NWS MRMS base reflectivity',
    freshness: 'Current quality-controlled composite; approximately 5-minute source updates',
    coverage: 'United States and nearby radar domains',
    attribution: 'Radar: NOAA/NWS MRMS',
  },
  satellite: {
    label: 'NOAA/NESDIS merged GOES GeoColor',
    freshness: 'Latest image exposed by NOAA; approximately 10-minute NEXUS refresh',
    coverage: 'GOES-East and GOES-West domains; not global',
    attribution: 'Imagery: NOAA/NESDIS',
  },
} as const
