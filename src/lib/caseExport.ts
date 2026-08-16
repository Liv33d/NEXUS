import type { Discovery, Signal } from '../types/signal'

export interface CaseBundle {
  format: 'nexus-case-v1'
  exportedAt: string
  case: Discovery
  evidence: Signal[]
  integrity: {
    includedSignals: number
    missingSignalIds: string[]
    note: string
  }
}

export function buildCaseBundle(discovery: Discovery, signals: Signal[], exportedAt = new Date()): CaseBundle {
  const evidenceById = new Map(signals.map((signal) => [signal.id, signal]))
  const evidence = discovery.signalIds.flatMap((id) => {
    const signal = evidenceById.get(id)
    return signal ? [signal] : []
  })
  return {
    format: 'nexus-case-v1',
    exportedAt: exportedAt.toISOString(),
    case: discovery,
    evidence,
    integrity: {
      includedSignals: evidence.length,
      missingSignalIds: discovery.signalIds.filter((id) => !evidenceById.has(id)),
      note: 'NEXUS exports preserve source-reported observations and deterministic relationships. Correlation does not establish causation.',
    },
  }
}

function safeFilename(title: string) {
  const stem = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72) || 'nexus-case'
  return `${stem}.nexus.json`
}

export async function exportCase(discovery: Discovery, signals: Signal[]): Promise<'shared' | 'downloaded'> {
  const json = JSON.stringify(buildCaseBundle(discovery, signals), null, 2)
  const filename = safeFilename(discovery.title)
  const file = new File([json], filename, { type: 'application/json' })
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: discovery.title, text: 'NEXUS case evidence export', files: [file] })
    return 'shared'
  }
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}
