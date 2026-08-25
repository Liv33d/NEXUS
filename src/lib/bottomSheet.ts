export type SheetDetent = 'peek' | 'story' | 'full'

export interface SheetDetentOffsets {
  peek: number
  story: number
  full: number
}

export function computeSheetDetentOffsets(fullHeight: number): SheetDetentOffsets {
  const safeHeight = Math.max(320, Number.isFinite(fullHeight) ? fullHeight : 320)
  const peekVisible = Math.min(190, Math.max(148, safeHeight - 176))
  const storyVisible = Math.min(safeHeight - 76, Math.max(peekVisible + 112, safeHeight * .56))
  return {
    peek: Math.max(0, safeHeight - peekVisible),
    story: Math.max(0, safeHeight - storyVisible),
    full: 0,
  }
}

export function clampSheetOffset(offset: number, offsets: SheetDetentOffsets) {
  return Math.max(offsets.full, Math.min(offsets.peek, offset))
}

export function adjacentSheetDetent(origin: SheetDetent, direction: 'up' | 'down'): SheetDetent {
  if (direction === 'up') return origin === 'peek' ? 'story' : 'full'
  return origin === 'full' ? 'story' : 'peek'
}

export function chooseSheetDetent(offsets: SheetDetentOffsets, origin: SheetDetent, offset: number, velocityY: number): SheetDetent {
  if (Math.abs(velocityY) >= .35) return adjacentSheetDetent(origin, velocityY < 0 ? 'up' : 'down')
  const projected = clampSheetOffset(offset + velocityY * 180, offsets)
  const entries = (Object.entries(offsets) as Array<[SheetDetent, number]>).sort((a, b) => Math.abs(a[1] - projected) - Math.abs(b[1] - projected))
  const nearest = entries[0]?.[0] ?? origin
  if (nearest === origin) return origin
  const originDistance = Math.abs(offsets[origin] - projected)
  const targetDistance = Math.abs(offsets[nearest] - projected)
  const spacing = Math.abs(offsets[origin] - offsets[nearest])
  return targetDistance + spacing * .12 < originDistance ? nearest : origin
}
