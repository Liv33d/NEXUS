export const OPEN_FREE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark'

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
