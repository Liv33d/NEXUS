export interface SubsolarPoint { longitude: number; latitude: number }

/**
 * NOAA-style fractional-year solar approximation. Accuracy is comfortably
 * within the visual resolution of the globe and, unlike the former shader,
 * does not depend on camera rotation.
 */
export function subsolarPoint(date = new Date()): SubsolarPoint {
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 0)
  const day = Math.floor((date.getTime() - yearStart) / 86_400_000)
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  const gamma = (2 * Math.PI / 365) * (day - 1 + (hour - 12) / 24)
  const equationOfTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma))
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma)
  let longitude = (720 - hour * 60 - equationOfTime) / 4
  longitude = ((longitude + 180) % 360 + 360) % 360 - 180
  return { longitude, latitude: declination * 180 / Math.PI }
}
