export interface GeographicView {
  latitude: number
  longitude: number
  altitude: number
}

export const DEFAULT_GEOGRAPHIC_VIEW: GeographicView = { latitude: 18, longitude: -45, altitude: 2.05 }
export const GLOBE_TO_DETAIL_ALTITUDE = 0.22
export const DETAIL_TO_GLOBE_ZOOM = 2.15

export function clampGeographicView(view: GeographicView): GeographicView {
  return {
    latitude: Math.max(-90, Math.min(90, Number.isFinite(view.latitude) ? view.latitude : DEFAULT_GEOGRAPHIC_VIEW.latitude)),
    longitude: Math.max(-180, Math.min(180, Number.isFinite(view.longitude) ? view.longitude : DEFAULT_GEOGRAPHIC_VIEW.longitude)),
    altitude: Math.max(0.08, Math.min(3.5, Number.isFinite(view.altitude) ? view.altitude : DEFAULT_GEOGRAPHIC_VIEW.altitude)),
  }
}

export function altitudeToMapZoom(altitude: number): number {
  return Math.max(0.75, Math.min(16, 2.557 - Math.log2(Math.max(0.08, altitude))))
}

export function mapZoomToAltitude(zoom: number): number {
  return Math.max(0.08, Math.min(3.5, 2 ** (2.557 - Math.max(0.75, Math.min(16, zoom)))))
}

export function geographicViewsDiffer(a: GeographicView, b: GeographicView): boolean {
  return Math.abs(a.latitude - b.latitude) >= 0.25 || Math.abs(a.longitude - b.longitude) >= 0.25 || Math.abs(a.altitude - b.altitude) >= 0.015
}

export function shouldEnterDetailedMap(view: GeographicView): boolean {
  return view.altitude <= GLOBE_TO_DETAIL_ALTITUDE
}

export function shouldReturnToGlobe(mapZoom: number): boolean {
  return mapZoom <= DETAIL_TO_GLOBE_ZOOM
}
