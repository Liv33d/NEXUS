import { describe, expect, it } from 'vitest'
import { normalizeGbifMediaLicense, selectGbifMediaCandidate, selectVernacularName } from './gbifPresentation'

const names = [
  { vernacularName: 'Paruline flamboyante', language: 'fra' },
  { vernacularName: 'American Redstart', language: 'eng' },
  { vernacularName: 'Candelita', language: 'spa', country: 'PR' },
  { vernacularName: 'Pavito migratorio', language: 'spa' },
]

describe('GBIF common-name localization', () => {
  it('maps browser language tags to GBIF ISO 639-3 codes', () => {
    expect(selectVernacularName(names, 'en-US')).toBe('American Redstart')
    expect(selectVernacularName(names, 'fr-FR')).toBe('Paruline flamboyante')
  })

  it('prefers an available country-specific name before the base language', () => {
    expect(selectVernacularName(names, 'es-PR')).toBe('Candelita')
    expect(selectVernacularName(names, 'es-MX')).toBe('Pavito migratorio')
  })

  it('falls back to English rather than inventing a localized name', () => {
    expect(selectVernacularName(names, 'is-IS')).toBe('American Redstart')
  })

  it('rejects checklist abbreviations that are not human names', () => {
    expect(selectVernacularName([{ vernacularName: 'BASW', language: 'eng' }, { vernacularName: 'Barn Swallow', language: 'eng' }], 'en-US')).toBe('Barn Swallow')
  })
})

describe('GBIF media policy', () => {
  const candidate = (overrides: Record<string, string | undefined> = {}) => ({
    type: 'StillImage', format: 'image/jpeg', identifier: 'https://images.example.org/bird.jpg',
    license: 'http://creativecommons.org/licenses/by/4.0/legalcode', creator: 'Example photographer',
    source: 'Example collection', references: 'https://example.org/occurrence/1', ...overrides,
  })

  it('normalizes only exact public-domain and attribution licenses', () => {
    expect(normalizeGbifMediaLicense('http://creativecommons.org/licenses/by/4.0/legalcode')).toBe('CC BY 4.0')
    expect(normalizeGbifMediaLicense('https://creativecommons.org/publicdomain/zero/1.0/')).toBe('CC0-1.0')
    for (const license of ['CC BY-SA 4.0', 'CC BY-NC 4.0', 'CC BY-ND 4.0', 'copyrighted', 'CC BY-ish']) {
      expect(normalizeGbifMediaLicense(license)).toBeUndefined()
    }
  })

  it('requires an exact still-image MIME, creator, HTTPS asset, and traceable HTTPS source', () => {
    for (const item of [
      candidate({ type: 'MovingImage' }), candidate({ format: 'image/svg+xml' }), candidate({ creator: undefined }),
      candidate({ rightsHolder: undefined, creator: undefined }), candidate({ references: undefined }),
      candidate({ identifier: 'http://images.example.org/bird.jpg' }),
    ]) expect(selectGbifMediaCandidate([item])).toBeUndefined()
  })

  it('ranks candidates deterministically instead of trusting API order', () => {
    const by = candidate({ identifier: 'https://images.example.org/a.jpg' })
    const cc0 = candidate({ identifier: 'https://images.example.org/z.jpg', license: 'CC0' })
    expect(selectGbifMediaCandidate([by, cc0])?.url).toBe(cc0.identifier)
    expect(selectGbifMediaCandidate([cc0, by])?.url).toBe(cc0.identifier)
    expect(selectGbifMediaCandidate([candidate({ identifier: 'https://images.example.org/b.jpg' }), candidate({ identifier: 'https://images.example.org/a.jpg' })])?.url)
      .toBe('https://images.example.org/a.jpg')
  })
})
