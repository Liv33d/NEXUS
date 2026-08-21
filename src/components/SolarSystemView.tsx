import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CircleHelp, LocateFixed } from 'lucide-react'
import { AmbientLight, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, Points, PointsMaterial, Raycaster, RingGeometry, Scene, SphereGeometry, Sprite, SpriteMaterial, Vector2, Vector3, WebGLRenderer } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { getSolarSystemSnapshot, type SolarBodyId } from '../lib/solarSystem'

interface Props { onBack(): void; batterySaver?: boolean }

const VISUAL_RADII: Record<SolarBodyId, number> = {
  mercury: .11, venus: .18, earth: .2, moon: .075, mars: .14, jupiter: .48, saturn: .42, uranus: .29, neptune: .28, pluto: .08,
}

function labelSprite(text: string): Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const context = canvas.getContext('2d')!
  context.font = '600 24px -apple-system, BlinkMacSystemFont, sans-serif'
  context.textAlign = 'center'
  context.fillStyle = 'rgba(239,248,247,.92)'
  context.shadowColor = 'rgba(0,0,0,.9)'
  context.shadowBlur = 8
  context.fillText(text, 128, 38)
  const texture = new CanvasTexture(canvas)
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.scale.set(1.55, .39, 1)
  return sprite
}

function starField(): Points {
  let seed = 0x2f6e2b1
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff }
  const positions: number[] = []
  for (let index = 0; index < 900; index++) {
    const radius = 45 + random() * 35
    const theta = random() * Math.PI * 2
    const phi = Math.acos(2 * random() - 1)
    positions.push(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta))
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return new Points(geometry, new PointsMaterial({ color: 0xcbe4e7, size: .055, transparent: true, opacity: .78, sizeAttenuation: true }))
}

function orbitGuide(radius: number): Line {
  const points: Vector3[] = []
  for (let index = 0; index <= 128; index++) {
    const angle = index / 128 * Math.PI * 2
    points.push(new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius))
  }
  return new Line(new BufferGeometry().setFromPoints(points), new LineBasicMaterial({ color: 0x5a7778, transparent: true, opacity: .22 }))
}

function SolarSystemView({ onBack, batterySaver = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [selectedId, setSelectedId] = useState<SolarBodyId>('earth')
  const snapshot = useMemo(() => getSolarSystemSnapshot(), [])
  const selected = snapshot.bodies.find((body) => body.id === selectedId) ?? snapshot.bodies[2]!

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new Scene()
    scene.background = new Color(0x010203)
    const camera = new PerspectiveCamera(42, 1, .05, 160)
    camera.position.set(0, 17, 24)
    const renderer = new WebGLRenderer({ antialias: !batterySaver, powerPreference: batterySaver ? 'low-power' : 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, batterySaver ? 1 : 1.5))
    host.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = .07
    controls.enablePan = false
    controls.minDistance = 5
    controls.maxDistance = 62
    controls.target.set(0, 0, 0)
    scene.add(new AmbientLight(0x95b7bd, 1.3))
    const stars = starField()
    scene.add(stars)
    const sun = new Mesh(new SphereGeometry(.72, batterySaver ? 24 : 40, batterySaver ? 16 : 28), new MeshBasicMaterial({ color: 0xffd782 }))
    scene.add(sun)
    const glow = new Mesh(new SphereGeometry(.93, 28, 20), new MeshBasicMaterial({ color: 0xffb45f, transparent: true, opacity: .13, depthWrite: false }))
    scene.add(glow)

    const selectable: Mesh[] = []
    const visualObjects = new Map<SolarBodyId, Mesh>()
    for (const body of snapshot.bodies) {
      if (body.id !== 'moon') scene.add(orbitGuide(Math.hypot(body.x, body.y, body.z)))
      const mesh = new Mesh(new SphereGeometry(VISUAL_RADII[body.id], batterySaver ? 16 : 28, batterySaver ? 12 : 20), new MeshStandardMaterial({ color: body.color, roughness: .82, metalness: .03 }))
      mesh.position.set(body.x, body.y, body.z)
      mesh.userData.bodyId = body.id
      scene.add(mesh)
      selectable.push(mesh)
      visualObjects.set(body.id, mesh)
      const label = labelSprite(body.name)
      label.position.copy(mesh.position).add(new Vector3(0, VISUAL_RADII[body.id] + .25, 0))
      scene.add(label)
      if (body.id === 'saturn') {
        const rings = new Mesh(new RingGeometry(.53, .82, 48), new MeshBasicMaterial({ color: 0xcbbd91, transparent: true, opacity: .62, side: 2, depthWrite: false }))
        rings.position.copy(mesh.position)
        rings.rotation.x = Math.PI / 2.25
        scene.add(rings)
      }
    }

    const raycaster = new Raycaster()
    const pointer = new Vector2()
    const choose = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(selectable, false)[0]
      const id = hit?.object.userData.bodyId as SolarBodyId | undefined
      if (!id) return
      setSelectedId(id)
      const target = visualObjects.get(id)?.position
      if (target) controls.target.copy(target)
    }
    renderer.domElement.addEventListener('pointerup', choose, { passive: true })
    let resizeFrame = 0
    const resize = () => {
      cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(() => {
        const rect = host.getBoundingClientRect()
        renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false)
        camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height)
        camera.updateProjectionMatrix()
      })
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    let frame = 0
    let running = true
    const animate = () => {
      if (!running) return
      controls.update()
      sun.rotation.y += .001
      stars.rotation.y += .00003
      renderer.render(scene, camera)
      frame = requestAnimationFrame(animate)
    }
    const visibility = () => {
      running = document.visibilityState === 'visible'
      if (running) animate()
      else cancelAnimationFrame(frame)
    }
    document.addEventListener('visibilitychange', visibility)
    animate()
    return () => {
      running = false
      cancelAnimationFrame(frame)
      cancelAnimationFrame(resizeFrame)
      observer.disconnect()
      document.removeEventListener('visibilitychange', visibility)
      renderer.domElement.removeEventListener('pointerup', choose)
      controls.dispose()
      scene.traverse((object) => {
        const renderable = object as Mesh
        renderable.geometry?.dispose()
        const materials = Array.isArray(renderable.material) ? renderable.material : renderable.material ? [renderable.material] : []
        for (const material of materials) {
          const spriteMaterial = material as SpriteMaterial
          spriteMaterial.map?.dispose()
          material.dispose()
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [batterySaver, snapshot])

  return <section className="solar-system" aria-label="Real-time Solar System">
    <div ref={hostRef} className="solar-canvas" role="img" aria-label="Interactive real-time heliocentric view of the Solar System"/>
    <button className="solar-back" onClick={onBack}><ArrowLeft/> Earth</button>
    <div className="solar-title"><span>SOLAR SYSTEM · NOW</span><strong>{new Date(snapshot.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</strong></div>
    <article className="solar-inspector">
      <header><div><span>{selected.parent ? 'EARTH SYSTEM' : 'HELIOCENTRIC POSITION'}</span><h2>{selected.name}</h2></div><LocateFixed/></header>
      <div><span>Sun distance</span><strong>{selected.id === 'moon' ? '1.00 AU' : `${selected.distanceAu.toFixed(selected.distanceAu < 2 ? 3 : 2)} AU`}</strong></div>
      <div><span>Mean radius</span><strong>{selected.radiusKm.toLocaleString()} km</strong></div>
      <p><CircleHelp/>{snapshot.method}</p>
    </article>
    <nav className="solar-body-rail" aria-label="Solar System bodies">{snapshot.bodies.filter((body) => body.id !== 'moon').map((body) => <button key={body.id} className={selectedId === body.id ? 'active' : ''} onClick={() => setSelectedId(body.id)}><i style={{ background: body.color }}/><span>{body.name}</span></button>)}</nav>
  </section>
}

export default memo(SolarSystemView)
