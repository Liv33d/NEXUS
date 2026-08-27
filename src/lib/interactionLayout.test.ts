import { describe, expect, it } from 'vitest'
import { focusOffsetForInspector, sameInspectorLayout, type InspectorLayout } from './interactionLayout'

describe('selection framing around the intelligence inspector', () => {
  it('centers the selection in the visible portrait Earth area', () => {
    const layout: InspectorLayout = { mode: 'portrait-sheet', detent: 'story', visibleHeight: 472, visibleWidth: 390 }
    expect(focusOffsetForInspector(layout, { width: 390, height: 844 })).toEqual([0, -236])
  })

  it('centers the selection beside a landscape inspector', () => {
    const layout: InspectorLayout = { mode: 'landscape-panel', detent: 'story', visibleHeight: 370, visibleWidth: 360 }
    expect(focusOffsetForInspector(layout, { width: 932, height: 430 })).toEqual([-180, 0])
  })

  it('does not move Earth when the full sheet obscures it', () => {
    const layout: InspectorLayout = { mode: 'portrait-sheet', detent: 'full', visibleHeight: 844, visibleWidth: 390 }
    expect(focusOffsetForInspector(layout, { width: 390, height: 844 })).toEqual([0, 0])
  })

  it('ignores sub-pixel observer noise', () => {
    const a: InspectorLayout = { mode: 'portrait-sheet', detent: 'story', visibleHeight: 472, visibleWidth: 390 }
    expect(sameInspectorLayout(a, { ...a, visibleHeight: 472.4 })).toBe(true)
    expect(sameInspectorLayout(a, { ...a, detent: 'peek' })).toBe(false)
  })
})
