import { Minimize2, PictureInPicture2, RotateCcw } from 'lucide-react'
import type * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { FaceLabel, Placement, Walls } from './box-packing-solver'

export type ViewOptions = {
  showTags: boolean
  showFaceLabels: boolean
  translucentFloor: boolean
  /** 箱を枠線だけで描く */
  wireframe: boolean
  /** 箱の不透明度（0.1〜1） */
  opacity: number
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
      // 半透明のときは、奥の箱が透けて見えるよう、手前の箱で奥を隠さない（depthWrite を切る）
      const see = p.opacity < 1
      m =
        label || tag
          ? new THREE.MeshStandardMaterial({
              map: faceTexture(p.hues[type], label, tag, fw, fh, minFontMm),
              roughness: 0.85,
              transparent: see,
              opacity: p.opacity,
              depthWrite: !see,
            })
          : new THREE.MeshStandardMaterial({
              color: new THREE.Color().setHSL(p.hues[type] / 360, 0.6, 0.62),
              roughness: 0.85,
              transparent: see,
              opacity: p.opacity,
              depthWrite: !see,
            })
      materials.set(key, m)
    }
    return m
  }

  // ワイヤーフレームの枠線は、箱の種類の色で描く
  const wireMaterials = new Map<number, THREE.LineBasicMaterial>()
  const wireMaterial = (type: number) => {
    let m = wireMaterials.get(type)
    if (!m) {
      m = new THREE.LineBasicMaterial({
        color: new THREE.Color().setHSL(p.hues[type] / 360, 0.7, 0.4),
      })
      wireMaterials.set(type, m)
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
    // ワイヤーフレームのときは面を描かない（クリックやホバーで箱を選べるよう、当たり判定には残す）
    mesh.visible = !p.wireframe
    meshes.push(mesh)
    const line = new THREE.LineSegments(
      edges,
      p.wireframe ? wireMaterial(b.type) : edgeMaterial,
    )
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

/** 斜め手前・上から見下ろす向き */
const viewDirection = new THREE.Vector3(0.45, -1, 0.6).normalize()

/** 浮かせた 3D 表示の、最初の位置と大きさ（画面の右下） */
function placeFloating(frame: HTMLElement) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = vw < 640 ? vw - 16 : Math.min(520, vw - 32)
  const height = Math.round(Math.min(vw < 640 ? 300 : 400, vh * 0.45))
  frame.style.width = `${width}px`
  frame.style.height = `${height}px`
  frame.style.left = `${vw - width - (vw < 640 ? 8 : 16)}px`
  frame.style.top = `${vh - height - (vw < 640 ? 8 : 16)}px`
}

export function PackingView(props: Props) {
  const frameRef = useRef<HTMLDivElement>(null)
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
  const [floating, setFloating] = useState(false)
  const { floorX, floorY, height, captureRef } = props
  const propsRef = useRef(props)
  propsRef.current = props
  /** 3D を回したり拡大したりしたら true。それまでは、結果や大きさが変わるたびに全体が収まるよう合わせ直す */
  const interactedRef = useRef(false)

  /** 床と積んだ箱の全体が、ちょうど画面に収まる位置にカメラを置く */
  const fitCamera = () => {
    const s = sceneRef.current
    if (!s) return
    const { floorX: X, floorY: Y, height: H } = propsRef.current
    const center = new THREE.Vector3(X / 2, Y / 2, H / 2)
    const radius = Math.max(1, 0.5 * Math.hypot(X, Y, H))
    const vfov = THREE.MathUtils.degToRad(s.camera.fov)
    const aspect = s.camera.aspect > 0 ? s.camera.aspect : 1
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
    const distance = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.02
    // ドラッグの勢い（慣性）が残っていると、合わせたあとも視点が流れるので消しておく。
    // OrbitControls は、慣性をオフにして update すると残りの勢いを捨てる
    s.controls.enableDamping = false
    s.controls.update()
    s.controls.enableDamping = true
    s.camera.position.copy(center).addScaledVector(viewDirection, distance)
    s.camera.near = distance / 100
    s.camera.far = distance * 10 + radius * 4
    s.camera.updateProjectionMatrix()
    s.controls.target.copy(center)
    s.controls.update()
  }
  const fitRef = useRef(fitCamera)
  fitRef.current = fitCamera

  const resetCamera = () => {
    interactedRef.current = false
    fitCamera()
  }

  // シーンの準備（1 回だけ）
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 100000)
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
    const onStart = () => {
      interactedRef.current = true
    }
    controls.addEventListener('start', onStart)

    sceneRef.current = {
      scene,
      camera,
      controls,
      renderer,
      model: null,
      meshes: [],
    }

    const resize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      // 表示される前（大きさ 0）は、縦横比が壊れるので何もしない
      if (w === 0 || h === 0) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      if (!interactedRef.current) fitRef.current()
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
      controls.removeEventListener('start', onStart)
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
    wireframe,
    opacity,
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
    wireframe,
    opacity,
  ])

  // 視点を合わせ直す。3D を触る前は毎回、触ったあとは全体の大きさが大きく変わったときだけ
  // （回して見ている途中に、少し高さが変わるたびに視点が動くと邪魔になる）
  const framedSpanRef = useRef(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: fitCamera は毎回作り直される関数なので外す
  useEffect(() => {
    const span = Math.max(floorX, floorY, height)
    const last = framedSpanRef.current
    const bigChange = last === 0 || span / last > 1.4 || last / span > 1.4
    if (!interactedRef.current || bigChange) {
      framedSpanRef.current = span
      fitCamera()
    }
  }, [floorX, floorY, height])

  // 浮かせたとき・戻したときの位置と大きさ（ドラッグや大きさの変更は、ブラウザが直接 style を書き換える）
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    if (floating) {
      placeFloating(frame)
    } else {
      frame.style.removeProperty('width')
      frame.style.removeProperty('height')
      frame.style.removeProperty('left')
      frame.style.removeProperty('top')
    }
  }, [floating])

  /** 浮かせた 3D 表示を、見出しの帯をつかんで動かす */
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const frame = frameRef.current
    if (!frame || (event.target as HTMLElement).closest('button')) return
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const left = frame.offsetLeft
    const top = frame.offsetTop
    const move = (e: PointerEvent) => {
      const maxLeft = window.innerWidth - 80
      const maxTop = window.innerHeight - 40
      frame.style.left = `${Math.min(maxLeft, Math.max(-frame.offsetWidth + 80, left + e.clientX - startX))}px`
      frame.style.top = `${Math.min(maxTop, Math.max(0, top + e.clientY - startY))}px`
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const hovered = hover ? placements[hover.index] : null

  return (
    <div>
      {floating && (
        <div className="flex h-24 items-center justify-center gap-3 rounded-lg border border-dashed text-sm text-muted-foreground">
          3D 表示は浮かせています
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFloating(false)}
          >
            ここに戻す
          </Button>
        </div>
      )}
      <div
        ref={frameRef}
        className={cn(
          floating
            ? 'fixed z-50 flex min-h-48 min-w-64 resize flex-col overflow-hidden rounded-lg border bg-background shadow-2xl'
            : 'relative',
        )}
      >
        {floating && (
          <div
            onPointerDown={startDrag}
            className="flex cursor-move touch-none items-center justify-between gap-2 border-b bg-muted/60 px-3 py-1 text-xs select-none"
          >
            <span className="truncate font-medium">
              3D 表示
              <span className="font-normal text-muted-foreground">
                ・ここをドラッグで移動・右下の角で大きさを変更
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={() => setFloating(false)}
            >
              <Minimize2 />
              戻す
            </Button>
          </div>
        )}
        <div className={cn('relative', floating && 'min-h-0 flex-1')}>
          <div
            ref={containerRef}
            className={cn(
              'w-full touch-none overflow-hidden bg-gradient-to-b from-sky-100 to-sky-50 dark:from-slate-800 dark:to-slate-900',
              floating ? 'h-full' : 'h-[60svh] min-h-80 rounded-lg border',
            )}
          />
          {hover && hovered && (
            <div
              className="pointer-events-none absolute z-10 rounded-md border bg-background/95 px-2 py-1 text-xs shadow"
              style={{
                left: Math.max(
                  0,
                  Math.min(
                    hover.x + 12,
                    (containerRef.current?.clientWidth ?? 0) - 180,
                  ),
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
          <div className="absolute top-2 right-2 flex gap-2">
            {!floating && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setFloating(true)}
              >
                <PictureInPicture2 />
                浮かせる
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={resetCamera}
            >
              <RotateCcw />
              視点を戻す
            </Button>
          </div>
          {!floating && (
            <p className="absolute bottom-2 left-2 rounded bg-background/80 px-2 py-1 text-xs text-muted-foreground">
              ドラッグで回転・ホイール（2
              本指）で拡大・右ドラッグで移動・箱をクリックで選択
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
