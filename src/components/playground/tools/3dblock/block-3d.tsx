import { RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { RangeSlider, Stat } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Mode = 'timber' | 'voxel'
type Params = {
  countX: number
  countY: number
  countZ: number
  sizeX: number
  sizeY: number
  sizeZ: number
  mode: Mode
  wireframe: boolean
  opacity: number
}

const initial: Params = {
  countX: 8,
  countY: 1,
  countZ: 3,
  sizeX: 7,
  sizeY: 3,
  sizeZ: 3.4,
  mode: 'timber',
  wireframe: false,
  opacity: 0.7,
}

/** 位置から決まる色（スライダーを動かしても色が入れ替わらない） */
function colorAt(i: number, j: number, k: number) {
  const hue = ((i * 53 + j * 97 + k * 151) % 360) / 360
  return new THREE.Color().setHSL(hue, 0.55, 0.6)
}

/** 文字を描いたスプライト（軸のラベル用） */
function textSprite(text: string, color: string) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const size = 48
  if (!ctx) return new THREE.Sprite()
  ctx.font = `bold ${size}px sans-serif`
  canvas.width = Math.ceil(ctx.measureText(text).width) + 8
  canvas.height = size * 1.3
  ctx.font = `bold ${size}px sans-serif`
  ctx.fillStyle = color
  ctx.fillText(text, 4, size)
  const texture = new THREE.CanvasTexture(canvas)
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false }),
  )
  sprite.scale.set((canvas.width / canvas.height) * 2, 2, 1)
  return sprite
}

/** シーンの中身（ブロックや柱・梁）を作る。InstancedMesh で数が多くても軽く描く */
function buildModel(p: Params) {
  const group = new THREE.Group()
  const box = new THREE.BoxGeometry(1, 1, 1)
  const matrix = new THREE.Matrix4()
  const place = (
    mesh: THREE.InstancedMesh,
    index: number,
    pos: THREE.Vector3,
    scale: THREE.Vector3,
  ) => {
    matrix.compose(pos, new THREE.Quaternion(), scale)
    mesh.setMatrixAt(index, matrix)
  }

  if (p.mode === 'voxel') {
    const count = p.countX * p.countY * p.countZ
    const scale = new THREE.Vector3(p.sizeX, p.sizeY, p.sizeZ)
    if (!p.wireframe) {
      const mesh = new THREE.InstancedMesh(
        box,
        new THREE.MeshStandardMaterial({
          transparent: true,
          opacity: p.opacity,
          roughness: 0.7,
          metalness: 0.1,
        }),
        count,
      )
      let n = 0
      for (let i = 0; i < p.countX; i++)
        for (let j = 0; j < p.countY; j++)
          for (let k = 0; k < p.countZ; k++) {
            place(
              mesh,
              n,
              new THREE.Vector3(
                (i + 0.5) * p.sizeX,
                (j + 0.5) * p.sizeY,
                (k + 0.5) * p.sizeZ,
              ),
              scale,
            )
            mesh.setColorAt(n++, colorAt(i, j, k))
          }
      group.add(mesh)
    }
    // 枠線は 1 つの LineSegments にまとめる
    const edges = new THREE.EdgesGeometry(box)
    const positions: number[] = []
    const edge = edges.attributes.position
    for (let i = 0; i < p.countX; i++)
      for (let j = 0; j < p.countY; j++)
        for (let k = 0; k < p.countZ; k++)
          for (let v = 0; v < edge.count; v++) {
            positions.push(
              (edge.getX(v) + i + 0.5) * p.sizeX,
              (edge.getY(v) + j + 0.5) * p.sizeY,
              (edge.getZ(v) + k + 0.5) * p.sizeZ,
            )
          }
    const lines = new THREE.BufferGeometry()
    lines.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    )
    group.add(
      new THREE.LineSegments(
        lines,
        new THREE.LineBasicMaterial({ color: 0x1f2937 }),
      ),
    )
    edges.dispose()
    return group
  }

  // 木組み: 柱（縦）と、X 方向・Y 方向の梁
  const t = Math.min(p.sizeX, p.sizeY, p.sizeZ) * 0.1
  const wood = new THREE.MeshStandardMaterial({
    color: 0xbb8553,
    roughness: 0.8,
    metalness: 0.1,
  })
  const columns = new THREE.InstancedMesh(
    box,
    wood,
    (p.countX + 1) * (p.countY + 1),
  )
  let n = 0
  const height = p.countZ * p.sizeZ
  for (let i = 0; i <= p.countX; i++)
    for (let j = 0; j <= p.countY; j++)
      place(
        columns,
        n++,
        new THREE.Vector3(i * p.sizeX, j * p.sizeY, height / 2),
        new THREE.Vector3(t, t, height),
      )
  group.add(columns)

  const lengthX = p.countX * p.sizeX + t
  const lengthY = p.countY * p.sizeY + t
  const beams = new THREE.InstancedMesh(
    box,
    wood,
    (p.countZ + 1) * (p.countY + 1 + p.countX + 1),
  )
  n = 0
  for (let k = 0; k <= p.countZ; k++) {
    for (let j = 0; j <= p.countY; j++)
      place(
        beams,
        n++,
        new THREE.Vector3((p.countX * p.sizeX) / 2, j * p.sizeY, k * p.sizeZ),
        new THREE.Vector3(lengthX, t, t),
      )
    for (let i = 0; i <= p.countX; i++)
      place(
        beams,
        n++,
        new THREE.Vector3(i * p.sizeX, (p.countY * p.sizeY) / 2, k * p.sizeZ),
        new THREE.Vector3(t, lengthY, t),
      )
  }
  group.add(beams)
  return group
}

function disposeGroup(group: THREE.Object3D) {
  group.traverse((o) => {
    const obj = o as THREE.Mesh
    obj.geometry?.dispose()
    const m = obj.material as THREE.Material | THREE.Material[] | undefined
    for (const mat of Array.isArray(m) ? m : m ? [m] : []) mat.dispose()
  })
}

export function Block3D() {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    model: THREE.Group | null
  } | null>(null)
  const [params, setParams] = useState<Params>(initial)
  const set = <K extends keyof Params>(key: K, value: Params[K]) =>
    setParams((p) => ({ ...p, [key]: value }))

  const center = (p: Params) =>
    new THREE.Vector3(
      (p.countX * p.sizeX) / 2,
      (p.countY * p.sizeY) / 2,
      (p.countZ * p.sizeZ) / 2,
    )

  const resetCamera = () => {
    const s = sceneRef.current
    if (!s) return
    const c = center(params)
    const span = Math.max(
      params.countX * params.sizeX,
      params.countY * params.sizeY,
      params.countZ * params.sizeZ,
    )
    s.camera.position.set(c.x - span * 0.6, c.y - span * 1.1, c.z + span * 0.6)
    s.controls.target.copy(c)
    s.controls.update()
  }

  // シーンの準備（1 回だけ）
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 1.2))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(30, -20, 60)
    scene.add(sun)

    const grid = new THREE.GridHelper(200, 100, 0x94a3b8, 0xcbd5e1)
    grid.rotation.x = Math.PI / 2
    grid.position.z = -0.01
    scene.add(grid)

    const axisLength = 15
    const axes: [THREE.Vector3, number, string, string, THREE.Vector3][] = [
      [
        new THREE.Vector3(1, 0, 0),
        0xef4444,
        '奥行き X',
        '#ef4444',
        new THREE.Vector3(axisLength + 3, 0, 1),
      ],
      [
        new THREE.Vector3(0, 1, 0),
        0x22c55e,
        'スパン Y',
        '#16a34a',
        new THREE.Vector3(0, axisLength + 3, 1),
      ],
      [
        new THREE.Vector3(0, 0, 1),
        0x3b82f6,
        '階数 Z',
        '#2563eb',
        new THREE.Vector3(0, 0, axisLength + 2),
      ],
    ]
    for (const [dir, color, label, css, at] of axes) {
      scene.add(
        new THREE.ArrowHelper(dir, new THREE.Vector3(), axisLength, color),
      )
      const sprite = textSprite(label, css)
      sprite.position.copy(at)
      scene.add(sprite)
    }

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI / 2
    controls.minDistance = 2
    controls.maxDistance = 300

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

    sceneRef.current = { scene, camera, controls, model: null }
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      disposeGroup(scene)
      renderer.dispose()
      renderer.domElement.remove()
      sceneRef.current = null
    }
  }, [])

  // 設定が変わったらモデルを作り直す
  const firstRef = useRef(true)
  // biome-ignore lint/correctness/useExhaustiveDependencies: 視点は最初の 1 回だけ合わせる
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    if (s.model) {
      s.scene.remove(s.model)
      disposeGroup(s.model)
    }
    s.model = buildModel(params)
    s.scene.add(s.model)
    if (firstRef.current) {
      firstRef.current = false
      resetCamera()
    }
  }, [params])

  const totalX = params.countX * params.sizeX
  const totalY = params.countY * params.sizeY
  const totalZ = params.countZ * params.sizeZ

  return (
    <div className="space-y-4">
      <div className="relative">
        <div
          ref={containerRef}
          className="h-[60svh] min-h-80 w-full overflow-hidden rounded-lg border bg-gradient-to-b from-sky-100 to-sky-50 dark:from-slate-800 dark:to-slate-900"
        />
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
          ドラッグで回転・ホイール（2 本指）で拡大・右ドラッグで移動
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="全体の寸法"
          value={`${totalX.toFixed(1)}×${totalY.toFixed(1)}×${totalZ.toFixed(1)}`}
          unit="m"
        />
        <Stat
          label="1 階の床面積"
          value={(totalX * totalY).toFixed(1)}
          unit="㎡"
        />
        <Stat
          label="延べ床面積"
          value={(totalX * totalY * params.countZ).toFixed(1)}
          unit="㎡"
        />
        <Stat
          label="体積"
          value={(totalX * totalY * totalZ).toFixed(0)}
          unit="㎥"
        />
      </div>

      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <RangeSlider
          label="奥行き X の数"
          value={params.countX}
          min={1}
          max={17}
          step={1}
          onChange={(v) => set('countX', v)}
        />
        <RangeSlider
          label="スパン Y の数"
          value={params.countY}
          min={1}
          max={6}
          step={1}
          onChange={(v) => set('countY', v)}
        />
        <RangeSlider
          label="階数 Z"
          value={params.countZ}
          min={1}
          max={6}
          step={1}
          onChange={(v) => set('countZ', v)}
        />
        <RangeSlider
          label="X の長さ"
          value={params.sizeX}
          min={5}
          max={11}
          step={0.1}
          unit="m"
          format={oneDecimal}
          onChange={(v) => set('sizeX', v)}
        />
        <RangeSlider
          label="Y の長さ"
          value={params.sizeY}
          min={1}
          max={7}
          step={0.1}
          unit="m"
          format={oneDecimal}
          onChange={(v) => set('sizeY', v)}
        />
        <RangeSlider
          label="階の高さ"
          value={params.sizeZ}
          min={2.5}
          max={7}
          step={0.1}
          unit="m"
          format={oneDecimal}
          onChange={(v) => set('sizeZ', v)}
        />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">表示</legend>
          <div className="inline-flex rounded-md border p-0.5">
            {(
              [
                ['timber', '木組み'],
                ['voxel', 'ブロック'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={params.mode === m}
                onClick={() => set('mode', m)}
                className={cn(
                  'rounded px-3 py-1 text-xs text-muted-foreground',
                  params.mode === m && 'bg-muted text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        {params.mode === 'voxel' && (
          <>
            <label className="flex items-center gap-2 self-end text-sm">
              <input
                type="checkbox"
                checked={params.wireframe}
                onChange={(e) => set('wireframe', e.target.checked)}
                className="size-4 accent-primary"
              />
              枠線だけにする
            </label>
            <RangeSlider
              label="不透明度"
              value={params.opacity}
              min={0.1}
              max={1}
              step={0.05}
              format={oneDecimal}
              onChange={(v) => set('opacity', v)}
            />
          </>
        )}
      </div>
    </div>
  )
}

/** 刻みが 1 未満のスライダーは小数 1 桁で見せる */
function oneDecimal(value: number) {
  return value.toFixed(1)
}
