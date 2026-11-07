import { RotateCcw } from 'lucide-react'
import type * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { Button } from '@/components/ui/button'
import type { FaceLabel, Placement, Walls } from './box-packing-solver'

export type ViewOptions = {
  showTags: boolean
  showFaceLabels: boolean
  translucentFloor: boolean
}

type Props = ViewOptions & {
  floorX: number
  floorY: number
  walls: Walls
  height: number
  placements: Placement[]
  /** 種類ごとの表示名と色相 */
  names: string[]
  hues: number[]
  cog: { x: number; y: number; z: number } | null
  selected: number | null
  onSelect: (index: number | null) => void
  /** PNG の書き出し用に、今の表示を画像にする関数を入れる */
  captureRef: React.RefObject<(() => Promise<Blob | null>) | null>
}

const boxColor = (hue: number) => `hsl(${hue} 60% 62%)`

// ---- 面に貼る絵 ----

/**
 * 箱の面に貼る絵。隅に向きの文字（上・前など）、真ん中にタグ。
 * faceW・faceH は面の大きさ（mm）。文字が小さくなりすぎるときは描かない
 */
function faceTexture(
  hue: number,
  label: FaceLabel | null,
  tag: string | null,
  faceW: number,
  faceH: number,
  minFontMm: number,
) {
  const scale = 512 / Math.max(faceW, faceH)
  const cw = Math.max(16, Math.round(faceW * scale))
  const ch = Math.max(16, Math.round(faceH * scale))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = boxColor(hue)
    ctx.fillRect(0, 0, cw, ch)
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'

    if (label) {
      const sizeMm = Math.min(faceW, faceH) * 0.2
      if (sizeMm >= minFontMm * 0.6) {
        const px = sizeMm * scale
        ctx.font = `bold ${px}px sans-serif`
        ctx.textAlign = 'left'
        ctx.fillText(label, px * 0.35, px * 0.75)
      }
    }
    if (tag) {
      ctx.font = 'bold 100px sans-serif'
      const ratio = ctx.measureText(tag).width / 100
      const sizeMm = Math.min(
        faceH * 0.3,
        (faceW * 0.84) / Math.max(ratio, 0.5),
      )
      if (sizeMm >= minFontMm) {
        ctx.font = `bold ${sizeMm * scale}px sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(tag, cw / 2, ch * 0.55)
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function disposeGroup(group: THREE.Object3D) {
  group.traverse((o) => {
    const obj = o as THREE.Mesh
    obj.geometry?.dispose()
    const m = obj.material as THREE.Material | THREE.Material[] | undefined
    for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
      ;(mat as THREE.MeshStandardMaterial).map?.dispose()
      mat.dispose()
    }
  })
}

// ---- シーンの中身 ----

function buildModel(p: Props) {
  const group = new THREE.Group()
  const meshes: THREE.Mesh[] = []
  const { floorX: X, floorY: Y } = p
  const span = Math.max(X, Y, p.height)

  // 床（半透明にすると、下の面も見られる）
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(X, Y),
    new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 1,
      transparent: p.translucentFloor,
      opacity: p.translucentFloor ? 0.3 : 1,
      side: THREE.DoubleSide,
      depthWrite: !p.translucentFloor,
    }),
  )
  floor.position.set(X / 2, Y / 2, -0.5)
  group.add(floor)
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(X, Y)),
    new THREE.LineBasicMaterial({ color: 0x334155 }),
  )
  outline.position.copy(floor.position)
  group.add(outline)

  // 壁（半透明の板）
  const wallH = Math.max(p.height * 1.1, Math.max(X, Y) * 0.25)
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const addWall = (width: number, x: number, y: number, rotZ: number) => {
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(width, wallH),
      wallMaterial,
    )
    wall.rotation.set(Math.PI / 2, rotZ, 0, 'ZXY')
    wall.position.set(x, y, wallH / 2)
    group.add(wall)
  }
  if (p.walls.back) addWall(X, X / 2, Y, 0)
  if (p.walls.left) addWall(Y, 0, Y / 2, Math.PI / 2)
  if (p.walls.right) addWall(Y, X, Y / 2, Math.PI / 2)

  // 箱。面の絵は「種類・向き・面の大きさ」が同じなら使い回す
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const edges = new THREE.EdgesGeometry(geometry)
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x1f2937 })
  const materials = new Map<string, THREE.MeshStandardMaterial>()
  const minFontMm = span * 0.012
  const material = (
    type: number,
    label: FaceLabel | null,
    tag: string | null,
    fw: number,
    fh: number,
  ) => {
    const key = `${type}|${label}|${tag}|${fw}x${fh}`
    let m = materials.get(key)
    if (!m) {
      m =
        label || tag
          ? new THREE.MeshStandardMaterial({
              map: faceTexture(p.hues[type], label, tag, fw, fh, minFontMm),
              roughness: 0.85,
            })
          : new THREE.MeshStandardMaterial({
              color: new THREE.Color(boxColor(p.hues[type])),
              roughness: 0.85,
            })
      materials.set(key, m)
    }
    return m
  }

  p.placements.forEach((b, index) => {
    // BoxGeometry の面の順（+X・-X・+Y・-Y・+Z・-Z）と、各面の横・縦の長さ
    const sizes: [number, number][] = [
      [b.d, b.h],
      [b.d, b.h],
      [b.w, b.h],
      [b.w, b.h],
      [b.w, b.d],
      [b.w, b.d],
    ]
    // タグは上を向いた面（+Z）と手前を向いた面（-Y）に出す
    const tagFaces = new Set([4, 3])
    const faceMaterials = sizes.map(([fw, fh], f) =>
      material(
        b.type,
        p.showFaceLabels ? b.faces[f] : null,
        p.showTags && tagFaces.has(f) ? p.names[b.type] : null,
        fw,
        fh,
      ),
    )
    const mesh = new THREE.Mesh(geometry, faceMaterials)
    mesh.position.set(b.x + b.w / 2, b.y + b.d / 2, b.z + b.h / 2)
    mesh.scale.set(b.w, b.d, b.h)
    mesh.userData.index = index
    meshes.push(mesh)
    const line = new THREE.LineSegments(edges, edgeMaterial)
    line.position.copy(mesh.position)
    line.scale.copy(mesh.scale)
    group.add(mesh, line)
  })

  // 選んだ箱を目立たせる
  if (p.selected !== null && p.placements[p.selected]) {
    const b = p.placements[p.selected]
    const pad = span * 0.004
    const highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(
        new THREE.BoxGeometry(b.w + pad, b.d + pad, b.h + pad),
      ),
      new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false }),
    )
    highlight.renderOrder = 10
    highlight.position.set(b.x + b.w / 2, b.y + b.d / 2, b.z + b.h / 2)
    group.add(highlight)
  }

  // 重心（赤い玉と、床に落とした線）
  if (p.cog && p.placements.length > 0) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(span * 0.012, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xdc2626, depthTest: false }),
    )
    marker.renderOrder = 11
    marker.position.set(p.cog.x, p.cog.y, p.cog.z)
    group.add(marker)
    const drop = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(p.cog.x, p.cog.y, p.cog.z),
      new THREE.Vector3(p.cog.x, p.cog.y, 0),
    ])
    const line = new THREE.Line(
      drop,
      new THREE.LineBasicMaterial({ color: 0xdc2626, depthTest: false }),
    )
    line.renderOrder = 11
    group.add(line)
  }

  return { group, meshes }
}

// ---- 部品 ----

const upName = (b: Placement) => b.faces[4]

export function PackingView(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    renderer: THREE.WebGLRenderer
    model: THREE.Group | null
    meshes: THREE.Mesh[]
  } | null>(null)
  const [hover, setHover] = useState<{
    index: number
    x: number
    y: number
  } | null>(null)
  const { floorX, floorY, height, captureRef } = props
  const propsRef = useRef(props)
  propsRef.current = props

  const resetCamera = () => {
    const s = sceneRef.current
    if (!s) return
    const span = Math.max(floorX, floorY, height)
    const target = new THREE.Vector3(floorX / 2, floorY / 2, height / 3)
    s.camera.position.set(
      target.x + span * 0.7,
      target.y - span * 1.5,
      target.z + span * 0.9,
    )
    s.camera.near = span / 200
    s.camera.far = span * 20
    s.camera.updateProjectionMatrix()
    s.controls.target.copy(target)
    s.controls.update()
  }

  // シーンの準備（1 回だけ）
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 100000)
    camera.up.set(0, 0, 1)
    // PNG で書き出せるよう、描いた絵を残しておく
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 1.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.position.set(0.6, -1, 1.6)
    scene.add(sun)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true

    const resize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // カーソルの下の箱（ホバーで情報を出し、ドラッグせずに離したら選ぶ）
    const raycaster = new THREE.Raycaster()
    const pick = (event: PointerEvent) => {
      const s = sceneRef.current
      if (!s) return null
      const rect = renderer.domElement.getBoundingClientRect()
      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(s.meshes, false)[0]
      return hit
        ? {
            index: hit.object.userData.index as number,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          }
        : null
    }
    let down: { x: number; y: number } | null = null
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.buttons === 0)
        setHover(pick(event))
    }
    const onDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY }
    }
    const onUp = (event: PointerEvent) => {
      if (!down) return
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y)
      down = null
      if (moved > 5) return
      const hit = pick(event)
      setHover(hit)
      propsRef.current.onSelect(hit ? hit.index : null)
    }
    const onLeave = () => setHover(null)
    const el = renderer.domElement
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointerleave', onLeave)

    sceneRef.current = {
      scene,
      camera,
      controls,
      renderer,
      model: null,
      meshes: [],
    }
    captureRef.current = () => {
      renderer.render(scene, camera)
      return new Promise<Blob | null>((resolve) =>
        renderer.domElement.toBlob(resolve, 'image/png'),
      )
    }
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerleave', onLeave)
      controls.dispose()
      disposeGroup(scene)
      renderer.dispose()
      el.remove()
      sceneRef.current = null
      captureRef.current = null
    }
  }, [captureRef])

  // 表示する中身が変わったら作り直す
  const {
    walls,
    placements,
    names,
    hues,
    cog,
    selected,
    showTags,
    showFaceLabels,
    translucentFloor,
  } = props
  // biome-ignore lint/correctness/useExhaustiveDependencies: props は上でばらした値で見張る
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    if (s.model) {
      s.scene.remove(s.model)
      disposeGroup(s.model)
    }
    const { group, meshes } = buildModel(propsRef.current)
    s.model = group
    s.meshes = meshes
    s.scene.add(group)
  }, [
    floorX,
    floorY,
    walls,
    height,
    placements,
    names,
    hues,
    cog,
    selected,
    showTags,
    showFaceLabels,
    translucentFloor,
  ])

  // 全体の大きさ（床の広さと高さのうち大きいほう）が大きく変わったときだけ、視点を合わせ直す。
  // 計算中に少し高さが変わるたびに視点が動くと、回して見ている途中で邪魔になる
  const framedSpanRef = useRef(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetCamera は毎回作り直される関数なので外す
  useEffect(() => {
    const span = Math.max(floorX, floorY, height)
    const last = framedSpanRef.current
    if (last > 0 && span / last < 1.4 && last / span < 1.4) return
    framedSpanRef.current = span
    resetCamera()
  }, [floorX, floorY, height])

  const hovered = hover ? placements[hover.index] : null

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-[60svh] min-h-80 w-full touch-none overflow-hidden rounded-lg border bg-gradient-to-b from-sky-100 to-sky-50 dark:from-slate-800 dark:to-slate-900"
      />
      {hover && hovered && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border bg-background/95 px-2 py-1 text-xs shadow"
          style={{
            left: Math.min(
              hover.x + 12,
              (containerRef.current?.clientWidth ?? 0) - 180,
            ),
            top: hover.y + 12,
          }}
        >
          <div className="font-medium">
            {hover.index + 1} 番目：{names[hovered.type]}
          </div>
          <div className="font-mono tabular-nums">
            {hovered.w} × {hovered.d} × {hovered.h} mm
          </div>
          <div>上を向いている面：{upName(hovered)}</div>
        </div>
      )}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="absolute top-2 right-2"
        onClick={resetCamera}
      >
        <RotateCcw />
        視点を戻す
      </Button>
      <p className="absolute bottom-2 left-2 rounded bg-background/80 px-2 py-1 text-xs text-muted-foreground">
        ドラッグで回転・ホイール（2
        本指）で拡大・右ドラッグで移動・箱をクリックで選択
      </p>
    </div>
  )
}
