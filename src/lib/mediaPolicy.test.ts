import { describe, expect, it } from 'vitest'
import { isCommercialMediaLicense, isDemoIntelligence, isRenderableMedia, renderableMedia } from './mediaPolicy'
import type { IntelligenceMedia, NexusIntelligenceObject } from '../types/intelligence'

function object(media: IntelligenceMedia[], demo = false): NexusIntelligenceObject {
  return {
    id: 'test', kind: 'species', domain: 'life', title: 'Test bird', status: 'recent', media,
    summary: 'Test', facts: [], relationships: [], methodology: 'Test',
    provenance: [{ label: demo ? 'DEMO_DATA' : 'OPEN_DATA', description: 'Test provenance' }],
  }
}

const valid: IntelligenceMedia = {
  id: 'valid', kind: 'photo', url: 'https://images.example.org/bird.jpg', title: 'Bird', alt: 'Bird',
  attribution: 'A. Photographer · CC BY 4.0', license: 'CC BY 4.0', sourceUrl: 'https://example.org/record/1',
}

describe('media presentation policy', () => {
  it('accepts commercial Creative Commons, public-domain, and government-work labels', () => {
    for (const license of ['CC0-1.0', 'Public Domain', 'CC BY 4.0', 'U.S. Government work']) expect(isCommercialMediaLicense(license)).toBe(true)
    for (const license of [undefined, '', 'All rights reserved', 'CC BY-NC 4.0', 'Not CC BY 4.0', 'CC BY-SA 4.0', 'CC BY-ND 4.0', 'almost cc0']) expect(isCommercialMediaLicense(license)).toBe(false)
    expect(isCommercialMediaLicense('https://creativecommons.org/licenses/by/4.0/')).toBe(true)
    expect(isCommercialMediaLicense('https://creativecommons.org/licenses/by-sa/4.0/')).toBe(false)
  })

  it('requires license, attribution, traceable source, and HTTPS before rendering', () => {
    expect(isRenderableMedia(valid, object([valid]))).toBe(true)
    expect(isRenderableMedia({ ...valid, license: undefined }, object([]))).toBe(false)
    expect(isRenderableMedia({ ...valid, attribution: '' }, object([]))).toBe(false)
    expect(isRenderableMedia({ ...valid, sourceUrl: undefined }, object([]))).toBe(false)
    expect(isRenderableMedia({ ...valid, url: 'javascript:alert(1)' }, object([]))).toBe(false)
  })

  it('permits licensed inline diagrams only inside explicitly marked demo fixtures', () => {
    const inline = { ...valid, url: 'data:image/svg+xml,safe', sourceUrl: undefined }
    expect(isRenderableMedia(inline, object([inline]))).toBe(false)
    expect(isRenderableMedia(inline, object([inline], true))).toBe(true)
  })

  it('filters unsafe candidates synchronously and detects demo provenance', () => {
    const unsafe = { ...valid, id: 'unsafe', license: 'All rights reserved' }
    const target = object([unsafe, valid], true)
    expect(isDemoIntelligence(target)).toBe(true)
    expect(renderableMedia(target).map((item) => item.id)).toEqual(['valid'])
  })
})
