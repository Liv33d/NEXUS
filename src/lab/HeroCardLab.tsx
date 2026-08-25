import { useMemo, useState } from 'react'
import { IntelligenceInspector, type InformationDensity } from '../components/IntelligenceInspector'
import type { NexusIntelligenceObject } from '../types/intelligence'
import { heroCardScenarios, type HeroScenarioId } from './heroCardScenarios'
import './hero-card-lab.css'

type Frame = 'portrait' | 'landscape'

function brokenMedia(object: NexusIntelligenceObject): NexusIntelligenceObject {
  const media = object.media.length ? object.media : [{
    id: `${object.id}-missing`, kind: 'photo' as const, role: 'representative' as const, url: '/__nexus_missing_fixture_media__.png',
    title: 'Missing-media fixture', alt: 'Deliberately missing media fixture', attribution: 'NEXUS test suite', freshness: 'derived' as const,
  }]
  return { ...object, media: media.map((item) => ({ ...item, url: '/__nexus_missing_fixture_media__.png' })) }
}

export default function HeroCardLab() {
  const [scenarioId, setScenarioId] = useState<HeroScenarioId>('bird')
  const [density, setDensity] = useState<InformationDensity>('standard')
  const [frame, setFrame] = useState<Frame>('portrait')
  const [simulateFailure, setSimulateFailure] = useState(false)
  const [visible, setVisible] = useState(true)
  const scenario = heroCardScenarios.find((item) => item.id === scenarioId) ?? heroCardScenarios[0]
  const object = useMemo(() => {
    const resolved = scenario.build()
    return simulateFailure ? brokenMedia(resolved) : resolved
  }, [scenario, simulateFailure])

  return <main className="hero-lab-shell">
    <header className="hero-lab-toolbar">
      <div><strong>NEXUS HERO CARD LAB</strong><span>FIXTURE LAB · NOT LIVE · EXCLUDED FROM PRODUCTION</span></div>
      <label>Scenario<select value={scenarioId} onChange={(event) => { setScenarioId(event.target.value as HeroScenarioId); setVisible(true) }}>{heroCardScenarios.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Density<select value={density} onChange={(event) => setDensity(event.target.value as InformationDensity)}><option value="simple">Simple</option><option value="standard">Standard</option><option value="expert">Expert</option></select></label>
      <div className="hero-lab-segment" role="group" aria-label="Preview orientation"><button className={frame === 'portrait' ? 'active' : ''} onClick={() => setFrame('portrait')}>Portrait</button><button className={frame === 'landscape' ? 'active' : ''} onClick={() => setFrame('landscape')}>Landscape</button></div>
      <label className="hero-lab-check"><input type="checkbox" checked={simulateFailure} onChange={(event) => { setSimulateFailure(event.currentTarget.checked); setVisible(true) }}/> Broken media</label>
    </header>
    <section className={`hero-lab-preview ${frame}`} aria-label={`${frame} Hero Card preview`}>
      <div className="hero-lab-earth"><span>EARTH REMAINS VISIBLE</span><i/></div>
      {visible ? <IntelligenceInspector object={object} density={density} onClose={() => setVisible(false)} onWatch={() => undefined} onSelectRelated={() => undefined}/> : <button className="hero-lab-reopen" onClick={() => setVisible(true)}>Reopen {object.title}</button>}
    </section>
    <footer><strong>Evidence contract</strong><span>All scenarios use fixed timestamps and production normalizers. Schematic media is CC0 layout material—not real-world evidence.</span></footer>
  </main>
}
