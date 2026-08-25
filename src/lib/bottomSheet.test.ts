import { describe, expect, it } from 'vitest'
import { adjacentSheetDetent, chooseSheetDetent, clampSheetOffset, computeSheetDetentOffsets } from './bottomSheet'

describe('bottom-sheet detents', () => {
  it('produces ordered and separated offsets on short and tall phones', () => {
    for (const height of [360, 620, 840]) {
      const offsets = computeSheetDetentOffsets(height)
      expect(offsets.full).toBe(0)
      expect(offsets.story).toBeGreaterThan(offsets.full)
      expect(offsets.peek).toBeGreaterThan(offsets.story)
      expect(offsets.peek - offsets.story).toBeGreaterThanOrEqual(70)
    }
  })

  it('derives the visible story height from the same offset used by the transform', () => {
    const fullHeight = 780
    const offsets = computeSheetDetentOffsets(fullHeight)
    const storyVisible = fullHeight - offsets.story
    expect(offsets.story).toBe(fullHeight - storyVisible)
    expect(storyVisible).toBeGreaterThan(190)
    expect(storyVisible).toBeLessThan(fullHeight)
  })

  it('clamps live movement to the full and peek limits', () => {
    const offsets = computeSheetDetentOffsets(700)
    expect(clampSheetOffset(-200, offsets)).toBe(offsets.full)
    expect(clampSheetOffset(900, offsets)).toBe(offsets.peek)
  })

  it('settles low-velocity movement to the nearest detent', () => {
    const offsets = computeSheetDetentOffsets(700)
    expect(chooseSheetDetent(offsets, 'peek', offsets.story + 4, 0)).toBe('story')
    expect(chooseSheetDetent(offsets, 'story', offsets.full + 2, 0)).toBe('full')
  })

  it('uses velocity to move exactly one detent', () => {
    const offsets = computeSheetDetentOffsets(700)
    expect(chooseSheetDetent(offsets, 'peek', offsets.peek, -.7)).toBe('story')
    expect(chooseSheetDetent(offsets, 'full', offsets.full, .8)).toBe('story')
    expect(adjacentSheetDetent('story', 'up')).toBe('full')
    expect(adjacentSheetDetent('story', 'down')).toBe('peek')
  })

  it('keeps the origin inside its hysteresis band', () => {
    const offsets = computeSheetDetentOffsets(700)
    const barelyTowardStory = offsets.peek - (offsets.peek - offsets.story) * .51
    expect(chooseSheetDetent(offsets, 'peek', barelyTowardStory, 0)).toBe('peek')
  })
})
