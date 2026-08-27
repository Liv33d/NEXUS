import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NexusIntelligenceObject } from '../types/intelligence'
import { IntelligenceInspector } from './IntelligenceInspector'

const object: NexusIntelligenceObject = {
  id: 'media-object', kind: 'signal', domain: 'weather', title: 'Test storm', status: 'recent', evidence: 'observed', timestamp: 1_800_000_000_000,
  media: [
    { id: 'first', kind: 'photo', url: 'https://example.com/one.jpg', title: 'Visible satellite', alt: 'Satellite view', attribution: 'NASA · Public Domain', license: 'Public Domain', sourceUrl: 'https://example.com/source/one' },
    { id: 'second', kind: 'photo', url: 'https://example.com/two.jpg', title: 'Radar composite', alt: 'Radar view', attribution: 'NOAA · U.S. Government work', license: 'U.S. Government work', sourceUrl: 'https://example.com/source/two' },
  ],
  summary: 'A deterministic accessibility fixture.', facts: [], relationships: [], provenance: [{ label: 'DEMO_DATA', description: 'Test fixture.' }], methodology: 'Fixture methodology.',
}

function installLayoutMocks(landscape: boolean) {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('orientation') ? landscape : false, media: query, addEventListener() {}, removeEventListener() {} }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('IntelligenceInspector accessibility', () => {
  it('exposes media choices as one named group with exactly one pressed button', () => {
    installLayoutMocks(false)
    render(<IntelligenceInspector object={object} detent="story" onDetentChange={() => undefined} onClose={() => undefined}/>)
    const group = screen.getByRole('group', { name: 'Evidence media' })
    const choices = within(group).getAllByRole('button')
    expect(choices.map((choice) => choice.getAttribute('aria-label'))).toEqual(['Visible satellite, 1 of 2', 'Radar composite, 2 of 2'])
    expect(choices.filter((choice) => choice.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
  })

  it('focuses the visible close action when a landscape inspector opens', () => {
    installLayoutMocks(true)
    render(<IntelligenceInspector object={object} detent="story" onDetentChange={() => undefined} onClose={() => undefined}/>)
    expect(screen.getByRole('button', { name: 'Close intelligence' })).toHaveFocus()
  })
})
