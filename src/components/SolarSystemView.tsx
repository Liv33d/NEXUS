import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CircleHelp, LocateFixed } from 'lucide-react'
import {
  AdditiveBlending, AmbientLight, BackSide, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute,
  Line, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PointLight,
  Points, PointsMaterial, Raycaster, RingGeometry, Scene, SphereGeometry, Sprite, SpriteMaterial,
  SRGBColorSpace, TextureLoader, Vector2, Vector3, WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { getSolarSystemSnapshot, type SolarBodyId } from '../lib/solarSystem'

interface Props { onBack(): void; batterySaver?: boolean }

const VISUAL_RADII: Record<SolarBodyId, number> = {
  mercury: .16, venus: .24, earth: .27, moon: .09, mars: .2, jupiter: .58, saturn: .5, uranus: .34, neptune: .33, pluto: .1,
}

function seeded(seed: number) {
  let value = seed >>> 0
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 0xffffffff }
}

function planetTexture(id: SolarBodyId): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const context = canvas.getContext('2d')!
  const random = seeded([...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) * 7919)
  const palettes: Record<SolarBodyId, [string, string, string]> = {
    mercury: ['#777570', '#b2ada4', '#4e4d4b'], venus: ['#c58b45', '#f0c977', '#8d5c31'], earth: ['#174f91', '#4c9ed0', '#f7fbff'],
    moon: ['#777a7b', '#c5c7c5', '#4c5052'], mars: ['#8f3827', '#cf7148', '#542a24'], jupiter: ['#bc8c61', '#ead1a6', '#8b583f'],
    saturn: ['#bba56c', '#eadca8', '#85734c'], uranus: ['#79bbc2', '#b9e0dd', '#4d909b'], neptune: ['#214b9a', '#4a75d2', '#173067'], pluto: ['#89776c', '#c2aca0', '#564b49'],
  }
  const [dark, light, accent] = palettes[id]
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height)
  gradient.addColorStop(0, dark); gradient.addColorStop(.5, light); gradient.addColorStop(1, dark)
  context.fillStyle = gradient
  context.fillRect(0, 0, canvas.width, canvas.height)

  if (id === 'jupiter' || id === 'saturn' || id === 'uranus' || id === 'neptune' || id === 'venus') {
    for (let index = 0; index < 30; index++) {
      const y = random() * canvas.height
      context.fillStyle = `${index % 3 === 0 ? accent : light}${id === 'uranus' ? '18' : '42'}`
      context.fillRect(0, y, canvas.width, 1 + random() * (id === 'jupiter' ? 9 : 5))
    }
  }
  if (id === 'jupiter') {
    context.fillStyle = 'rgba(158,69,46,.88)'
    context.beginPath(); context.ellipse(355, 158, 39, 17, -.08, 0, Math.PI * 2); context.fill()
    context.strokeStyle = 'rgba(255,214,172,.35)'; context.lineWidth = 4; context.stroke()
  }
  if (id === 'earth') {
    context.fillStyle = '#446e37'
    const land = [[90,75,48,23],[145,119,27,52],[273,73,70,26],[331,112,42,48],[406,157,25,18]]
    for (const [x,y,rx,ry] of land) { context.beginPath(); context.ellipse(x!,y!,rx!,ry!,random()-.5,0,Math.PI*2); context.fill() }
    context.strokeStyle = 'rgba(255,255,255,.58)'; context.lineWidth = 3
    for (let index=0;index<16;index++){ const y=20+random()*216; context.beginPath();context.moveTo(0,y);context.bezierCurveTo(150,y+30*(random()-.5),350,y+30*(random()-.5),512,y);context.stroke() }
  }
  if (id === 'mars') {
    context.fillStyle = 'rgba(70,38,32,.55)'
    for (let index=0;index<18;index++){ context.beginPath();context.ellipse(random()*512,random()*256,8+random()*35,4+random()*17,random()*Math.PI,0,Math.PI*2);context.fill() }
    context.fillStyle='rgba(238,222,201,.78)';context.fillRect(0,0,512,8);context.fillRect(0,246,512,10)
  }
  if (id === 'mercury' || id === 'moon' || id === 'pluto') {
    for (let index = 0; index < 75; index++) {
      const radius = 2 + random() * 13
      context.fillStyle = `rgba(30,31,31,${.08 + random() * .2})`
      context.beginPath(); context.arc(random() * 512, random() * 256, radius, 0, Math.PI * 2); context.fill()
      context.strokeStyle = 'rgba(245,240,225,.13)'; context.lineWidth = 1.5; context.stroke()
    }
  }
  for (let index = 0; index < 140; index++) {
    context.fillStyle = `rgba(${random() > .5 ? '255,255,255' : '0,0,0'},${.015 + random() * .06})`
    context.fillRect(random() * 512, random() * 256, 1 + random() * 9, 1 + random() * 4)
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

function labelSprite(text: string): Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 256; canvas.height = 64
  const context = canvas.getContext('2d')!
  context.font = '600 24px -apple-system, BlinkMacSystemFont, sans-serif'; context.textAlign = 'center'
  context.fillStyle = 'rgba(239,248,247,.92)'; context.shadowColor = 'rgba(0,0,0,.9)'; context.shadowBlur = 8
  context.fillText(text, 128, 38)
  const texture = new CanvasTexture(canvas)
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.scale.set(1.55, .39, 1)
  return sprite
}

function starField(): Points {
  const random = seeded(0x2f6e2b1)
  const positions: number[] = []
  for (let index = 0; index < 1100; index++) {
    const radius = 45 + random() * 35; const theta = random() * Math.PI * 2; const phi = Math.acos(2 * random() - 1)
    positions.push(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta))
  }
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return new Points(geometry, new PointsMaterial({ color: 0xcbe4e7, size: .055, transparent: true, opacity: .78, sizeAttenuation: true }))
}

function orbitGuide(radius: number): Line {
  const points: Vector3[] = []
  for (let index = 0; index <= 128; index++) { const angle = index / 128 * Math.PI * 2; points.push(new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)) }
  return new Line(new BufferGeometry().setFromPoints(points), new LineBasicMaterial({ color: 0x5a7778, transparent: true, opacity: .2 }))
}

function SolarSystemView({ onBack, batterySaver = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const focusRef = useRef<(id: SolarBodyId) => void>(() => undefined)
  const selectedRef = useRef<SolarBodyId>('earth')
  const onBackRef = useRef(onBack)
  const [selectedId, setSelectedId] = useState<SolarBodyId>('earth')
  const snapshot = useMemo(() => getSolarSystemSnapshot(), [])
  const selected = snapshot.bodies.find((body) => body.id === selectedId) ?? snapshot.bodies[2]!

  useEffect(() => { selectedRef.current = selectedId; onBackRef.current = onBack }, [onBack, selectedId])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new Scene(); scene.background = new Color(0x010203)
    const camera = new PerspectiveCamera(43, 1, .025, 180)
    const renderer = new WebGLRenderer({ antialias: !batterySaver, powerPreference: batterySaver ? 'low-power' : 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, batterySaver ? 1 : 1.5)); host.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.dampingFactor = .075; controls.enablePan = false; controls.minDistance = .62; controls.maxDistance = 62
    scene.add(new AmbientLight(0x71858a, .72))
    scene.add(new PointLight(0xffe2ae, 48, 70, 1.35))
    const stars = starField(); scene.add(stars)
    const sun = new Mesh(new SphereGeometry(.78, batterySaver ? 28 : 56, batterySaver ? 18 : 36), new MeshBasicMaterial({ color: 0xffcf6d }))
    scene.add(sun)
    const glow = new Mesh(new SphereGeometry(1.18, 36, 24), new MeshBasicMaterial({ color: 0xffa541, transparent: true, opacity: .12, blending: AdditiveBlending, depthWrite: false }))
    scene.add(glow)

    const selectable: Mesh[] = []
    const visualObjects = new Map<SolarBodyId, Mesh>()
    for (const body of snapshot.bodies) {
      if (body.id !== 'moon') scene.add(orbitGuide(Math.hypot(body.x, body.y, body.z)))
      const texture = body.id === 'earth' ? new TextureLoader().load(`${import.meta.env.BASE_URL}earth-blue-marble.jpg`) : planetTexture(body.id)
      texture.colorSpace = SRGBColorSpace
      const mesh = new Mesh(new SphereGeometry(VISUAL_RADII[body.id], batterySaver ? 24 : 52, batterySaver ? 16 : 34), new MeshStandardMaterial({ map: texture, color: 0xffffff, roughness: .86, metalness: .01 }))
      mesh.position.set(body.x, body.y, body.z); mesh.userData.bodyId = body.id
      scene.add(mesh); selectable.push(mesh); visualObjects.set(body.id, mesh)
      const label = labelSprite(body.name); label.position.copy(mesh.position).add(new Vector3(0, VISUAL_RADII[body.id] + .28, 0)); label.userData.bodyLabel = body.id; scene.add(label)
      if (body.id === 'earth' || body.id === 'venus' || body.id === 'uranus' || body.id === 'neptune') {
        const color = body.id === 'earth' ? 0x5aaeff : body.id === 'venus' ? 0xe7bd78 : body.id === 'uranus' ? 0x8de5e9 : 0x547dff
        const atmosphere = new Mesh(new SphereGeometry(VISUAL_RADII[body.id] * 1.08, 30, 20), new MeshBasicMaterial({ color, transparent: true, opacity: .12, side: BackSide, blending: AdditiveBlending, depthWrite: false }))
        atmosphere.position.copy(mesh.position); scene.add(atmosphere)
      }
      if (body.id === 'saturn') {
        const rings = new Mesh(new RingGeometry(.61, 1.03, 96), new MeshBasicMaterial({ color: 0xd8c99c, transparent: true, opacity: .68, side: 2, depthWrite: false }))
        rings.position.copy(mesh.position); rings.rotation.x = Math.PI / 2.25; scene.add(rings)
      }
    }

    const focus = (id: SolarBodyId, distance = Math.max(1.4, VISUAL_RADII[id] * 6.4)) => {
      const target = visualObjects.get(id)?.position
      if (!target) return
      const direction = camera.position.clone().sub(controls.target).normalize()
      controls.target.copy(target); camera.position.copy(target).add(direction.multiplyScalar(distance)); controls.update()
    }
    focusRef.current = focus
    const earth = visualObjects.get('earth')!.position
    controls.target.copy(earth); camera.position.copy(earth).add(new Vector3(0, .42, 1.15)); controls.update()

    const raycaster = new Raycaster(); const pointer = new Vector2()
    const choose = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const id = raycaster.intersectObjects(selectable, false)[0]?.object.userData.bodyId as SolarBodyId | undefined
      if (id) { setSelectedId(id); focus(id) }
    }
    const returnAtEarth = () => { if (selectedRef.current === 'earth' && camera.position.distanceTo(controls.target) <= .72) onBackRef.current() }
    renderer.domElement.addEventListener('pointerup', choose, { passive: true }); controls.addEventListener('end', returnAtEarth)
    let resizeFrame = 0
    const resize = () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => { const rect = host.getBoundingClientRect(); renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false); camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height); camera.updateProjectionMatrix() }) }
    const observer = new ResizeObserver(resize); observer.observe(host); resize()
    let frame = 0; let running = true
    const animate = () => {
      if (!running) return
      controls.update(); sun.rotation.y += .0012; stars.rotation.y += .00003
      for (const object of visualObjects.values()) object.rotation.y += object.userData.bodyId === 'jupiter' ? .003 : .001
      const distance = camera.position.distanceTo(controls.target)
      scene.traverse((object) => { if (object.userData.bodyLabel) object.visible = distance > 4 || object.userData.bodyLabel === selectedRef.current })
      renderer.render(scene, camera); frame = requestAnimationFrame(animate)
    }
    const visibility = () => { running = document.visibilityState === 'visible'; if (running) animate(); else cancelAnimationFrame(frame) }
    document.addEventListener('visibilitychange', visibility); animate()
    return () => {
      running = false; cancelAnimationFrame(frame); cancelAnimationFrame(resizeFrame); observer.disconnect(); document.removeEventListener('visibilitychange', visibility)
      renderer.domElement.removeEventListener('pointerup', choose); controls.removeEventListener('end', returnAtEarth); controls.dispose(); focusRef.current = () => undefined
      scene.traverse((object) => { const renderable = object as Mesh; renderable.geometry?.dispose(); const materials = Array.isArray(renderable.material) ? renderable.material : renderable.material ? [renderable.material] : []; for (const material of materials) { (material as SpriteMaterial).map?.dispose(); material.dispose() } })
      renderer.dispose(); renderer.domElement.remove()
    }
  }, [batterySaver, snapshot])

  return <section className="solar-system" aria-label="Real-time Solar System">
    <div ref={hostRef} className="solar-canvas" role="img" aria-label="Interactive real-time Solar System entered by zooming outward from Earth"/>
    <button className="solar-back" onClick={onBack}><ArrowLeft/> Earth</button>
    <div className="solar-title"><span>EARTH → SOLAR SYSTEM · NOW</span><strong>Pinch outward to reveal orbit · pinch into Earth to return</strong></div>
    <article className="solar-inspector">
      <header><div><span>{selected.parent ? 'EARTH SYSTEM' : 'HELIOCENTRIC POSITION'}</span><h2>{selected.name}</h2></div><LocateFixed/></header>
      <div><span>Sun distance</span><strong>{selected.id === 'moon' ? '1.00 AU' : `${selected.distanceAu.toFixed(selected.distanceAu < 2 ? 3 : 2)} AU`}</strong></div>
      <div><span>Mean radius</span><strong>{selected.radiusKm.toLocaleString()} km</strong></div>
      <p><CircleHelp/>{snapshot.method} Surface treatments are detailed visual interpretations; orbital positions are calculated.</p>
    </article>
    <nav className="solar-body-rail" aria-label="Solar System bodies">{snapshot.bodies.filter((body) => body.id !== 'moon').map((body) => <button key={body.id} className={selectedId === body.id ? 'active' : ''} onClick={() => { setSelectedId(body.id); focusRef.current(body.id) }}><i style={{ background: body.color }}/><span>{body.name}</span></button>)}</nav>
  </section>
}

export default memo(SolarSystemView)
