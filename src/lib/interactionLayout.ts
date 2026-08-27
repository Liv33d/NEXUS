import type { SheetDetent } from './bottomSheet'

export interface InspectorLayout {
  mode: 'portrait-sheet' | 'landscape-panel'
  detent: SheetDetent
  visibleHeight: number
  visibleWidth: number
}

export interface ViewportSize {
  width: number
  height: number
}

export function sameInspectorLayout(a?: InspectorLayout, b?: InspectorLayout) {
  if (!a || !b) return a === b
  return a.mode === b.mode
    && a.detent === b.detent
    && Math.abs(a.visibleHeight - b.visibleHeight) < 1
    && Math.abs(a.visibleWidth - b.visibleWidth) < 1
}

/**
 * Places the selected location in the center of the Earth area that remains
 * visible beside or above the inspector. Values are MapLibre pixel offsets.
 */
export function focusOffsetForInspector(layout: InspectorLayout | undefined, viewport: ViewportSize): [number, number] {
  if (!layout || layout.detent === 'full') return [0, 0]
  if (layout.mode === 'landscape-panel') {
    return [-Math.min(layout.visibleWidth / 2, viewport.width * .42), 0]
  }
  return [0, -Math.min(layout.visibleHeight / 2, viewport.height * .42)]
}
