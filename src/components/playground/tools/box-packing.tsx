import {
  Dices,
  Download,
  FileJson,
  ImageDown,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Save,
  Square,
  Trash2,
  Upload,
} from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { HelpTip, RangeSlider, Stat } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { WorkerMessage } from './box-packing.worker'
import { SavedResults, type SettingsSummary } from './box-packing-saved'
import {
  type BoxSpec,
  type Objective,
  type PackInput,
  type PackResult,
  type Placement,
  random,
  type Walls,
} from './box-packing-solver'
import { gridStep, PackingView, type ViewOptions } from './box-packing-view'

// ---- 設定 ----

/** enabled: 積み上げに使うか（使わない箱は、リストに残したまま計算から外す） */
type BoxRow = BoxSpec & { id: number; enabled: boolean }

type RandomOptions = {
  types: number
  total: number
  min: number
  max: number
  layDownPercent: number
  seed: number
}

type Settings = Omit<PackInput, 'boxes' | 'seed'> & {
  boxes: BoxRow[]
  random: RandomOptions
}

const MAX_SIZE = 20000
const MAX_COUNT_PER_ROW = 200
const MAX_TOTAL = 200
const MAX_ROWS = 50
/** 設定を最後に触ってから計算し直すまでの時間（触っている間は計算し直さない） */
const DEBOUNCE_MS = 1000
/** 保存しておく候補の数 */
const MAX_CANDIDATES = 10

let nextId = 1
const row = (box: BoxSpec, enabled = true): BoxRow => ({
  ...box,
  enabled,
  id: nextId++,
})
/** 計算に使う個数（使わない箱は 0 個） */
const usedCount = (b: BoxRow) => (b.enabled ? b.count : 0)

const initial: Settings = {
  floorX: 1100,
  floorY: 1100,
  walls: { back: false, left: false, right: false },
  gap: 5,
  edgeGap: 5,
  supportPercent: 95,
  objective: 'height',
  wallBias: 50,
  boxes: [
    { tag: '冬服', x: 500, y: 400, z: 350, count: 4, canLayDown: false },
    { tag: '本', x: 400, y: 300, z: 250, count: 8, canLayDown: false },
    { tag: '食器', x: 330, y: 250, z: 200, count: 10, canLayDown: false },
    { tag: '細長いもの', x: 600, y: 200, z: 150, count: 4, canLayDown: true },
    { tag: '小物', x: 250, y: 200, z: 150, count: 4, canLayDown: false },
  ].map((box) => row(box)),
  random: {
    types: 5,
    total: 30,
    min: 150,
    max: 600,
    layDownPercent: 50,
    seed: 1,
  },
}

const isSize = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_SIZE
const toInt = (value: string) => Math.trunc(Number(value))

function validate(s: Settings): string | null {
  if (!isSize(s.floorX) || !isSize(s.floorY)) {
    return `床の幅と奥行きは 1〜${MAX_SIZE} mm の整数で入れてください。`
  }
  if (s.floorX <= 2 * s.edgeGap || s.floorY <= 2 * s.edgeGap) {
    return '床が、端のすき間より狭くなっています。'
  }
  for (const [i, b] of s.boxes.entries()) {
    const label = b.tag || `箱 ${i + 1}`
    if (![b.x, b.y, b.z].every(isSize)) {
      return `「${label}」の寸法は 1〜${MAX_SIZE} mm の整数で入れてください。`
    }
    if (
      !Number.isInteger(b.count) ||
      b.count < 0 ||
      b.count > MAX_COUNT_PER_ROW
    ) {
      return `「${label}」の個数は 0〜${MAX_COUNT_PER_ROW} 個で入れてください。`
    }
  }
  const total = s.boxes.reduce((sum, b) => sum + usedCount(b), 0)
  if (total === 0) return '積み上げに使う箱を 1 個以上入れてください。'
  if (total > MAX_TOTAL)
    return `箱は全部で ${MAX_TOTAL} 個までです（今は ${total} 個）。`
  return null
}

function toInput(s: Settings, seed: number): PackInput {
  const { random: _random, boxes, ...rest } = s
  return {
    ...rest,
    boxes: boxes.map(({ id: _id, enabled: _enabled, ...box }) => ({
      ...box,
      count: usedCount({ ...box, id: _id, enabled: _enabled }),
    })),
    seed,
  }
}

/** タグが空の箱は「箱 1」のように番号で呼ぶ */
const nameOf = (boxes: BoxSpec[], type: number) =>
  boxes[type]?.tag.trim() || `箱 ${type + 1}`

/** 同じタグの箱は同じ色。色相を黄金角ずつずらして、隣どうしが似た色にならないようにする */
function huesOf(boxes: BoxSpec[]) {
  const order = new Map<string, number>()
  return boxes.map((_, type) => {
    const name = nameOf(boxes, type)
    if (!order.has(name)) order.set(name, order.size)
    return ((order.get(name) ?? 0) * 137.508 + 20) % 360
  })
}

// ---- ランダムな箱 ----

function randomBoxes(options: RandomOptions, s: Settings): BoxSpec[] {
  const rand = random(options.seed)
  const between = (min: number, max: number) =>
    Math.round((min + rand() * Math.max(0, max - min)) / 5) * 5
  const types = Math.max(1, Math.min(options.types, options.total, MAX_ROWS))
  // どの種類も 1 個以上にして、残りをランダムに配る
  const counts = Array.from({ length: types }, () => 1)
  for (let i = types; i < options.total; i++)
    counts[Math.floor(rand() * types)]++
  // 床からはみ出す箱は作らない
  const limitX = s.floorX - 2 * s.edgeGap
  const limitY = s.floorY - 2 * s.edgeGap
  const min = Math.max(5, options.min)
  return counts.map((count, i) => ({
    tag: `テスト ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) + 1 : ''}`,
    x: Math.max(1, between(min, Math.min(options.max, limitX))),
    y: Math.max(1, between(min, Math.min(options.max, limitY))),
    z: Math.max(1, between(min, options.max)),
    count,
    canLayDown: rand() * 100 < options.layDownPercent,
  }))
}

// ---- 書き出し・読み込み ----

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function csvCell(value: string | number) {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function placementsCsv(boxes: BoxSpec[], placements: Placement[]) {
  const lines = [
    [
      '順番',
      'タグ',
      'x',
      'y',
      'z',
      '幅',
      '奥行き',
      '高さ',
      '上を向いている面',
      '横倒し',
    ],
    ...placements.map((p, i) => [
      i + 1,
      nameOf(boxes, p.type),
      p.x,
      p.y,
      p.z,
      p.w,
      p.d,
      p.h,
      p.faces[4],
      p.laidDown ? 'はい' : 'いいえ',
    ]),
  ]
  // 先頭の BOM は、Excel で開いたときに文字化けさせないため
  return `﻿${lines.map((l) => l.map(csvCell).join(',')).join('\r\n')}\r\n`
}

/** 設定を JSON にできる形にする（書き出し・ブラウザへの保存で使う。使わない箱も個数のまま残す） */
function serializeSettings(settings: Settings) {
  const { boxes: _used, seed: _seed, ...rest } = toInput(settings, 0)
  const boxes = settings.boxes.map(({ id: _id, ...box }) => box)
  return { ...rest, boxes, random: settings.random }
}

function exportJson(settings: Settings, result: PackResult | null) {
  const boxes = settings.boxes
  return JSON.stringify(
    {
      tool: 'box-packing',
      version: 1,
      unit: 'mm',
      settings: serializeSettings(settings),
      result: result && {
        height: result.height,
        fillRate: result.fillRate,
        floorCoverage: result.floorCoverage,
        cog: result.cog,
        placements: result.placements.map((p, i) => ({
          order: i + 1,
          tag: nameOf(boxes, p.type),
          x: p.x,
          y: p.y,
          z: p.z,
          w: p.w,
          d: p.d,
          h: p.h,
          upFace: p.faces[4],
          laidDown: p.laidDown,
        })),
        unplaced: result.unplaced.map((u) => ({
          tag: nameOf(boxes, u.type),
          count: u.count,
          reason: u.reason,
        })),
      },
    },
    null,
    2,
  )
}

/** 書き出した JSON から設定を読み戻す */
function parseSettings(text: string): Settings | null {
  const data = JSON.parse(text) as { settings?: unknown }
  return parseSettingsObject(data?.settings)
}

/** JSON から読んだ設定を確かめて戻す。数値は範囲に収め、残りは validate で確かめる */
function parseSettingsObject(value: unknown): Settings | null {
  const s = value as Record<string, unknown> | null
  if (!s || typeof s !== 'object' || !Array.isArray(s.boxes)) return null
  const num = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.min(max, Math.max(min, Math.trunc(v)))
      : fallback
  const walls = (s.walls ?? {}) as Record<string, unknown>
  const r = (s.random ?? {}) as Record<string, unknown>
  return {
    floorX: num(s.floorX, initial.floorX, 1, MAX_SIZE),
    floorY: num(s.floorY, initial.floorY, 1, MAX_SIZE),
    walls: {
      back: walls.back === true,
      left: walls.left === true,
      right: walls.right === true,
    },
    gap: num(s.gap, initial.gap, 0, 50),
    edgeGap: num(s.edgeGap, initial.edgeGap, 0, 50),
    supportPercent: num(s.supportPercent, initial.supportPercent, 50, 100),
    objective: s.objective === 'floor' ? 'floor' : 'height',
    wallBias: num(s.wallBias, initial.wallBias, 0, 100),
    boxes: (s.boxes as Record<string, unknown>[]).slice(0, MAX_ROWS).map((b) =>
      row(
        {
          tag: typeof b?.tag === 'string' ? b.tag.slice(0, 40) : '',
          x: num(b?.x, 1, 1, MAX_SIZE),
          y: num(b?.y, 1, 1, MAX_SIZE),
          z: num(b?.z, 1, 1, MAX_SIZE),
          count: num(b?.count, 0, 0, MAX_COUNT_PER_ROW),
          canLayDown: b?.canLayDown === true,
        },
        b?.enabled !== false,
      ),
    ),
    random: {
      types: num(r.types, initial.random.types, 1, MAX_ROWS),
      total: num(r.total, initial.random.total, 1, MAX_TOTAL),
      min: num(r.min, initial.random.min, 5, MAX_SIZE),
      max: num(r.max, initial.random.max, 5, MAX_SIZE),
      layDownPercent: num(
        r.layDownPercent,
        initial.random.layDownPercent,
        0,
        100,
      ),
      seed: num(r.seed, initial.random.seed, 0, 999999),
    },
  }
}

// ---- ブラウザへの保存 ----

/** 設定・表示・保存した結果を、ページを読み込み直しても残すための localStorage のキー */
const STORAGE = {
  settings: 'mosunset:box-packing:settings',
  view: 'mosunset:box-packing:view',
  saved: 'mosunset:box-packing:saved',
} as const

/** プライベートモードなどで localStorage が使えないときは、保存せずに続ける */
function readStorage(key: string): unknown {
  try {
    const text = window.localStorage.getItem(key)
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

const defaultView: ViewOptions = {
  showTags: true,
  showFaceLabels: true,
  translucentFloor: false,
  wireframe: false,
  opacity: 1,
  showGrid: true,
}

function loadView(): ViewOptions {
  const v = readStorage(STORAGE.view) as Record<string, unknown> | null
  if (!v || typeof v !== 'object') return defaultView
  const flag = (key: keyof ViewOptions) =>
    typeof v[key] === 'boolean'
      ? (v[key] as boolean)
      : (defaultView[key] as boolean)
  const opacity =
    typeof v.opacity === 'number' && Number.isFinite(v.opacity)
      ? Math.min(1, Math.max(0.1, v.opacity))
      : 1
  return {
    showTags: flag('showTags'),
    showFaceLabels: flag('showFaceLabels'),
    translucentFloor: flag('translucentFloor'),
    wireframe: flag('wireframe'),
    showGrid: flag('showGrid'),
    opacity,
  }
}

/** 初期値（箱の行は作り直して、前の行と番号が重ならないようにする） */
function freshInitial(): Settings {
  return {
    ...initial,
    boxes: initial.boxes.map(({ id: _id, enabled, ...box }) =>
      row(box, enabled),
    ),
  }
}

/** 保存した結果。設定と結果を一緒に持つ */
type Saved = {
  id: string
  savedAt: number
  run: number
  settings: Settings
  result: PackResult
}

/** 保存しておく結果の数 */
const MAX_SAVED = 20

/** ブラウザに残っていた結果を読む。形がおかしいものは捨てる */
function loadSaved(): Saved[] {
  const list = readStorage(STORAGE.saved)
  if (!Array.isArray(list)) return []
  const isNumber = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
  const out: Saved[] = []
  for (const item of list.slice(-MAX_SAVED)) {
    try {
      const settings = parseSettingsObject(item?.settings)
      const r = item?.result as PackResult | undefined
      if (
        !settings ||
        !r ||
        !Array.isArray(r.placements) ||
        !Array.isArray(r.unplaced) ||
        ![r.height, r.fillRate, r.floorCoverage].every(isNumber)
      ) {
        continue
      }
      out.push({
        id: String(item.id),
        savedAt: isNumber(item.savedAt) ? item.savedAt : Date.now(),
        run: isNumber(item.run) ? item.run : 1,
        settings,
        result: r,
      })
    } catch {
      // 壊れた 1 件は飛ばす
    }
  }
  return out
}

/** 比べるときに並べる、設定の要点 */
function summarize(s: Settings): SettingsSummary {
  const walls =
    [s.walls.back && '奥', s.walls.left && '左', s.walls.right && '右']
      .filter(Boolean)
      .join('・') || 'なし'
  const used = s.boxes.filter((b) => b.enabled && b.count > 0)
  return [
    { label: '床', value: `${s.floorX}×${s.floorY}` },
    { label: '壁', value: walls },
    { label: 'すき間', value: `${s.gap}/${s.edgeGap} mm` },
    { label: '支え', value: `${s.supportPercent}%` },
    { label: '優先', value: s.objective === 'height' ? '高さ' : '1 段目' },
    { label: '寄せ', value: String(s.wallBias) },
    {
      label: '箱',
      value: `${used.length} 種 ${used.reduce((n, b) => n + b.count, 0)} 個`,
    },
    // 寸法や横倒しの違いは、要点の数字だけでは分からないので、中身から短い印を作る
    { label: '箱の中身', value: boxesMark(used) },
  ]
}

/** 箱のリストの中身から作る短い印（同じ中身なら同じ印になる） */
function boxesMark(boxes: BoxRow[]) {
  const text = boxes
    .map((b) => `${b.tag}|${b.x}|${b.y}|${b.z}|${b.count}|${b.canLayDown}`)
    .join(';')
  let h = 0
  for (let i = 0; i < text.length; i++)
    h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36).slice(0, 4).toUpperCase()
}

// ---- 計算の状態 ----

type Candidate = {
  id: number
  /** 何回目の探し方（乱数の種）で見つけたか */
  run: number
  settings: Settings
  result: PackResult
  /** 計算を始めてから見つかるまでの時間 */
  elapsed: number
}

type RunStatus = 'waiting' | 'running' | 'stopped' | 'done' | 'invalid'

const statusText: Record<RunStatus, string> = {
  waiting: '設定の変更を待っています（最後に触ってから 1 秒で計算し直します）',
  running: '計算中（裏で良い並べ方を探し続けています）',
  stopped: '止めました',
  done: 'しばらく良い結果が出なくなったので止めました',
  invalid: '入力を直すと計算します',
}

const percent = (v: number) => (v * 100).toFixed(1)
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} 秒`

// ---- 本体 ----

/** ラベル付きの数値の入力欄（整数） */
function NumberField({
  label,
  value,
  min,
  max,
  inline = false,
  help,
  onChange,
}: {
  label: string
  /** ラベルの横の「？」で出す説明 */
  help?: React.ReactNode
  value: number
  min: number
  max: number
  /** ラベルと入力欄を横に並べる */
  inline?: boolean
  onChange: (value: number) => void
}) {
  const id = useId()
  return (
    <div
      className={cn(
        'text-sm',
        inline ? 'flex items-center gap-2' : 'space-y-1',
      )}
    >
      <span className="flex items-center gap-1">
        <label htmlFor={id}>{label}</label>
        {help && <HelpTip>{help}</HelpTip>}
      </span>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(toInt(e.target.value))}
        className={cn(
          'font-mono tabular-nums',
          inline && 'h-8 w-28 text-right',
        )}
      />
    </div>
  )
}

const numberInput = 'h-8 w-20 px-2 text-right font-mono tabular-nums'

/**
 * 同時に動かす Worker の数。CPU のコアの数から、画面のために 1 つ残す（1〜8）。
 * それぞれ別の乱数で並べ順を探し、いちばん良い結果を採る
 */
const workerCount = Math.max(
  1,
  Math.min(8, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1),
)

export function BoxPacking() {
  // 前に開いたときの設定・表示・保存した結果を、ブラウザから読み戻す
  const [settings, setSettings] = useState<Settings>(
    () => parseSettingsObject(readStorage(STORAGE.settings)) ?? initial,
  )
  const [view, setView] = useState<ViewOptions>(loadView)
  const [saved, setSaved] = useState<Saved[]>(loadSaved)
  /** 表示している保存した結果（null なら今の計算の結果） */
  const [viewingSaved, setViewingSaved] = useState<string | null>(null)
  const [status, setStatus] = useState<RunStatus>('waiting')
  const [progress, setProgress] = useState({ tried: 0, elapsed: 0 })
  const [candidates, setCandidates] = useState<Candidate[]>([])
  /** null なら、いちばん新しい（良い）候補を見せ続ける */
  const [pinned, setPinned] = useState<number | null>(null)
  const [visible, setVisible] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [runToken, setRunToken] = useState(0)
  const workersRef = useRef<Worker[]>([])
  const captureRef = useRef<(() => Promise<Blob | null>) | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const layDownAllRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }))
  const setBox = (id: number, patch: Partial<Omit<BoxRow, 'id'>>) =>
    setSettings((s) => ({
      ...s,
      boxes: s.boxes.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }))
  const setRandom = (patch: Partial<RandomOptions>) =>
    setSettings((s) => ({ ...s, random: { ...s.random, ...patch } }))

  const error = validate(settings)
  // ランダム生成の設定だけを変えたときは、計算し直さない
  const { random: _randomOptions, ...packSettings } = settings
  const packKey = JSON.stringify(packSettings)

  // 設定が変わったら前の計算を止め、最後に触ってから DEBOUNCE_MS たったら計算し直す。
  // 待っている間は、前の結果を表示したままにする（スライダーを動かしている間に 3D が空にならないように）
  // biome-ignore lint/correctness/useExhaustiveDependencies: packKey が中身の変化を表す
  useEffect(() => {
    const clear = () => {
      setCandidates([])
      setPinned(null)
      setSelected(null)
      setVisible(null)
      setProgress({ tried: 0, elapsed: 0 })
    }
    if (error) {
      clear()
      setStatus('invalid')
      return
    }
    setStatus('waiting')
    const snapshot = settings
    const workers: Worker[] = []
    let nextCandidateId = 1
    // 全部の Worker を通して、いちばん良い結果だけを候補にする
    let bestScore = Number.POSITIVE_INFINITY
    const tried = new Array<number>(workerCount).fill(0)
    let elapsed = 0
    let finished = 0
    const timer = window.setTimeout(() => {
      clear()
      setStatus('running')
      for (let w = 0; w < workerCount; w++) {
        const worker = new Worker(
          new URL('./box-packing.worker.ts', import.meta.url),
          { type: 'module' },
        )
        workers.push(worker)
        worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
          const message = event.data
          tried[w] = message.tried
          elapsed = Math.max(elapsed, message.elapsed)
          setProgress({ tried: tried.reduce((a, b) => a + b, 0), elapsed })
          if (message.kind === 'best') {
            if (message.result.score >= bestScore - 1e-9) return
            bestScore = message.result.score
            const candidate: Candidate = {
              id: nextCandidateId++,
              run: runToken + 1,
              settings: snapshot,
              result: message.result,
              elapsed: message.elapsed,
            }
            setCandidates((list) => [...list, candidate].slice(-MAX_CANDIDATES))
          } else if (message.kind === 'done') {
            worker.terminate()
            finished++
            if (finished === workerCount) setStatus('done')
          }
        }
        worker.onerror = () => {
          for (const x of workers) x.terminate()
          setStatus('stopped')
          toast.error('計算に失敗しました')
        }
        // Worker ごとに乱数の種を変えて、別々の並べ順を探させる
        worker.postMessage(toInput(snapshot, (runToken + 1) * 1000 + w))
      }
      workersRef.current = workers
    }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      for (const worker of workers) worker.terminate()
      workersRef.current = []
    }
  }, [packKey, error, runToken])

  const stop = () => {
    for (const worker of workersRef.current) worker.terminate()
    workersRef.current = []
    setStatus('stopped')
  }

  const allLayDown = settings.boxes.every((b) => b.canLayDown)
  const someLayDown = settings.boxes.some((b) => b.canLayDown)
  useEffect(() => {
    if (layDownAllRef.current) {
      layDownAllRef.current.indeterminate = someLayDown && !allLayDown
    }
  }, [someLayDown, allLayDown])

  // 変えるたびにブラウザへ保存する
  useEffect(() => {
    writeStorage(STORAGE.settings, serializeSettings(settings))
  }, [settings])
  useEffect(() => {
    writeStorage(STORAGE.view, view)
  }, [view])
  useEffect(() => {
    const ok = writeStorage(
      STORAGE.saved,
      saved.map((x) => ({ ...x, settings: serializeSettings(x.settings) })),
    )
    if (!ok && saved.length > 0) {
      toast.error(
        'ブラウザに保存できませんでした（容量が足りないか、保存が許可されていません）',
      )
    }
  }, [saved])

  const latest = candidates.at(-1)
  const candidate = candidates.find((c) => c.id === pinned) ?? latest
  const savedShown = saved.find((x) => x.id === viewingSaved)
  // 保存した結果を表示しているときはそれを、そうでなければ今の計算の候補を見せる
  const current = savedShown
    ? {
        key: `s${savedShown.id}`,
        settings: savedShown.settings,
        result: savedShown.result,
      }
    : candidate && {
        key: `c${candidate.id}`,
        settings: candidate.settings,
        result: candidate.result,
      }
  const result = current?.result
  const shownBoxes = current?.settings.boxes ?? settings.boxes
  const names = useMemo(
    () => shownBoxes.map((_, i) => nameOf(shownBoxes, i)),
    [shownBoxes],
  )
  const hues = useMemo(() => huesOf(shownBoxes), [shownBoxes])
  const formHues = huesOf(settings.boxes)
  const placements = useMemo(
    () =>
      result
        ? result.placements.slice(0, visible ?? result.placements.length)
        : [],
    [result, visible],
  )
  const total = settings.boxes.reduce((sum, b) => sum + usedCount(b), 0)
  const shownTotal = shownBoxes.reduce((sum, b) => sum + usedCount(b), 0)

  // 表示する結果が変わったら、積む順のスライダーと選んだ箱を戻す
  // biome-ignore lint/correctness/useExhaustiveDependencies: 表示する結果が変わったときだけ
  useEffect(() => {
    setVisible(null)
    setSelected(null)
  }, [current?.key])

  /** 候補を「保存した結果」に足す（いっぱいなら古いものから消す） */
  const saveCandidate = (c: Candidate) => {
    const entry: Saved = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      savedAt: Date.now(),
      run: c.run,
      settings: c.settings,
      result: c.result,
    }
    setSaved((list) => [...list, entry].slice(-MAX_SAVED))
    toast.success('保存しました（下の「保存した結果」で比べられます）')
  }

  const restoreSaved = (id: string) => {
    const entry = saved.find((x) => x.id === id)
    if (!entry) return
    if (
      !window.confirm(
        '今の設定を、この結果の設定に置き換えます。よろしいですか？',
      )
    )
      return
    // 箱の行は作り直す（今の行と番号が重ならないように）
    setSettings({
      ...entry.settings,
      boxes: entry.settings.boxes.map(({ id: _id, enabled, ...box }) =>
        row(box, enabled),
      ),
    })
    setViewingSaved(null)
    toast.success('設定を戻しました')
  }

  const resetAll = () => {
    if (
      !window.confirm(
        '床・積み方・箱のリスト・ランダム生成・表示の設定を、すべて初期値に戻します。保存した結果は消しません。よろしいですか？',
      )
    ) {
      return
    }
    setSettings(freshInitial())
    setView(defaultView)
    setViewingSaved(null)
    toast.success('設定を初期値に戻しました')
  }

  const currentSummary = useMemo(() => summarize(settings), [settings])
  const savedViews = useMemo(
    () => saved.map((x) => ({ ...x, summary: summarize(x.settings) })),
    [saved],
  )

  const generate = (mode: 'replace' | 'append') => {
    const boxes = randomBoxes(settings.random, settings).map((box) => row(box))
    if (mode === 'replace') {
      if (
        !window.confirm(
          '今の箱のリストを消して、ランダムな箱に置き換えます。よろしいですか？',
        )
      ) {
        return
      }
      set('boxes', boxes)
    } else {
      set('boxes', [...settings.boxes, ...boxes].slice(0, MAX_ROWS))
    }
  }

  const importFile = async (file: File) => {
    try {
      if (file.size > 1024 * 1024) throw new Error('too large')
      const next = parseSettings(await file.text())
      if (!next) throw new Error('invalid')
      setSettings(next)
      toast.success('設定を読み込みました')
    } catch {
      toast.error('このツールで書き出した JSON を選んでください')
    }
  }

  return (
    <div className="space-y-6">
      <PackingView
        {...view}
        floorX={current?.settings.floorX ?? settings.floorX}
        floorY={current?.settings.floorY ?? settings.floorY}
        walls={current?.settings.walls ?? settings.walls}
        height={result?.height ?? 0}
        placements={placements}
        names={names}
        hues={hues}
        cog={visible === null ? (result?.cog ?? null) : null}
        selected={selected}
        onSelect={setSelected}
        captureRef={captureRef}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={view.showTags}
            onChange={(e) =>
              setView((v) => ({ ...v, showTags: e.target.checked }))
            }
            className="size-4 accent-primary"
          />
          タグ
        </label>
        <HelpTip>
          箱の上の面と手前の面に、入力したタグ（何の箱か）を表示します。
        </HelpTip>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={view.showFaceLabels}
            onChange={(e) =>
              setView((v) => ({ ...v, showFaceLabels: e.target.checked }))
            }
            className="size-4 accent-primary"
          />
          向きの文字（上・下・左・右・前・後）
        </label>
        <HelpTip>
          箱の 6
          つの面に、入力したときの向きでの面の名前を表示します。横倒しにした箱は、上を向いた面に「前」か「左」と出るので、どう倒したかが分かります。
        </HelpTip>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={view.translucentFloor}
            onChange={(e) =>
              setView((v) => ({ ...v, translucentFloor: e.target.checked }))
            }
            className="size-4 accent-primary"
          />
          床を半透明にする
        </label>
        <HelpTip>
          床を透かして、視点を床の下に回したときに、箱の下の面も見られるようにします。
        </HelpTip>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={view.wireframe}
            onChange={(e) =>
              setView((v) => ({ ...v, wireframe: e.target.checked }))
            }
            className="size-4 accent-primary"
          />
          ワイヤーフレーム
        </label>
        <HelpTip>
          箱の面を描かず、枠線だけで表示します。奥や内側の箱の置き方を確かめるときに使います。枠線は箱の種類の色です。
        </HelpTip>
        <div className="w-44">
          <RangeSlider
            label="箱の不透明度"
            value={Math.round(view.opacity * 100)}
            min={10}
            max={100}
            step={5}
            unit="%"
            help="箱をどれだけ透かすかです。下げると、手前の箱越しに奥の箱が見えます。"
            onChange={(v) => setView((o) => ({ ...o, opacity: v / 100 }))}
          />
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={view.showGrid}
            onChange={(e) =>
              setView((v) => ({ ...v, showGrid: e.target.checked }))
            }
            className="size-4 accent-primary"
          />
          格子と原点
        </label>
        <HelpTip>
          床に格子を引き、原点（床の左手前の角）に X・Y・Z の矢印を出します。5
          本ごとに少し濃い線です。重心の位置を読むときの目安に使います。
        </HelpTip>
        <span className="text-xs text-muted-foreground">
          赤い玉と床の十字は全体の重心です。
          {view.showGrid &&
            `格子は ${gridStep(
              current?.settings.floorX ?? settings.floorX,
              current?.settings.floorY ?? settings.floorY,
            )} mm 間隔です。`}
        </span>
      </div>

      {/* 計算の状態 */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
        {(status === 'running' || status === 'waiting') && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        )}
        <span>{statusText[status]}</span>
        {progress.tried > 0 && (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {progress.tried.toLocaleString()} 通り・{seconds(progress.elapsed)}
            ・{workerCount} 並列
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {status === 'running' ? (
            <Button type="button" variant="outline" size="sm" onClick={stop}>
              <Square />
              停止
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!!error}
              onClick={() => setRunToken((t) => t + 1)}
            >
              <Play />
              別の探し方でもう一度
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label="全体の高さ"
          value={result ? result.height.toLocaleString() : '—'}
          unit="mm"
        />
        <Stat
          label="充填率"
          value={result ? percent(result.fillRate) : '—'}
          unit="%"
          hint="箱の体積 ÷（床 × 高さ）"
        />
        <Stat
          label="1 段目の埋まり"
          value={result ? percent(result.floorCoverage) : '—'}
          unit="%"
          hint="床に直接置いた箱の底面積"
        />
        <Stat
          label="置けた箱"
          value={result ? result.placements.length : '—'}
          unit={result ? `/ ${shownTotal} 個` : ''}
        />
        <Stat
          label="重心（x, y, z）"
          value={
            result?.cog
              ? `${Math.round(result.cog.x)}, ${Math.round(result.cog.y)}, ${Math.round(result.cog.z)}`
              : '—'
          }
          unit="mm"
          className="col-span-2 lg:col-span-1 [&_span.font-mono]:text-lg"
        />
      </div>

      {result && result.unplaced.length > 0 && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">
            置けなかった箱があります
          </p>
          <ul className="mt-1 list-disc pl-5">
            {result.unplaced.map((u) => (
              <li key={`${u.type}-${u.reason}`}>
                {names[u.type]} × {u.count}：
                {u.reason === 'too-big'
                  ? 'どの向きでも床からはみ出します'
                  : '下の支えが足りません（支えの割合を下げるか、横倒しを許可すると置けることがあります）'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 候補。増えても下の設定がずれないよう、高さを決めて中だけスクロールする */}
      <section className="space-y-2 rounded-lg border p-4">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">
            候補（探し方 #{runToken + 1}・良い結果が見つかるたびに追加）
          </h2>
          {pinned !== null && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setPinned(null)
                setViewingSaved(null)
              }}
            >
              いちばん良い結果を表示し続ける
            </Button>
          )}
        </div>
        <div className="h-56 overflow-auto rounded-md border">
          {candidates.length === 0 && (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {status === 'invalid'
                ? '入力を直すと計算します'
                : '計算すると、ここに候補が並びます'}
            </p>
          )}
          <table
            className={cn(
              'w-full min-w-[32rem] text-sm [&_td]:px-3 [&_th]:px-3',
              candidates.length === 0 && 'hidden',
            )}
          >
            <thead className="sticky top-0 bg-background text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-normal">見つかった時間</th>
                <th className="py-1 font-normal">高さ</th>
                <th className="py-1 font-normal">充填率</th>
                <th className="py-1 font-normal">1 段目</th>
                <th className="py-1 font-normal">置けた箱</th>
                <th className="py-1 font-normal">重心 x, y</th>
                <th className="py-1">
                  <span className="sr-only">表示</span>
                </th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {[...candidates].reverse().map((c) => {
                const active = !savedShown && c.id === candidate?.id
                return (
                  <tr
                    key={c.id}
                    className={cn('border-t', active && 'bg-muted/60')}
                  >
                    <td className="py-1">
                      {seconds(c.elapsed)}
                      {c.id === latest?.id && (
                        <span className="ml-2 font-sans text-xs text-primary">
                          最良
                        </span>
                      )}
                    </td>
                    <td className="py-1">
                      {c.result.height.toLocaleString()} mm
                    </td>
                    <td className="py-1">{percent(c.result.fillRate)}%</td>
                    <td className="py-1">{percent(c.result.floorCoverage)}%</td>
                    <td className="py-1">{c.result.placements.length}</td>
                    <td className="py-1">
                      {c.result.cog
                        ? `${Math.round(c.result.cog.x)}, ${Math.round(c.result.cog.y)}`
                        : '—'}
                    </td>
                    <td className="py-1 text-right whitespace-nowrap">
                      <Button
                        type="button"
                        variant={active ? 'secondary' : 'ghost'}
                        size="sm"
                        aria-pressed={active}
                        onClick={() => {
                          setPinned(c.id === latest?.id ? null : c.id)
                          setViewingSaved(null)
                        }}
                      >
                        {active ? '表示中' : '表示'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        title="比べるために、下の「保存した結果」に残します"
                        onClick={() => saveCandidate(c)}
                      >
                        <Save />
                        保存
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <SavedResults
        saved={savedViews}
        current={currentSummary}
        viewing={savedShown ? savedShown.id : null}
        onView={setViewingSaved}
        onRestore={restoreSaved}
        onDelete={(id) => {
          setSaved((list) => list.filter((x) => x.id !== id))
          if (viewingSaved === id) setViewingSaved(null)
        }}
        onClear={() => {
          setSaved([])
          setViewingSaved(null)
        }}
      />

      {/* 結果がないときも欄は出しておく（出たり消えたりで下の設定がずれないように） */}
      <div
        className={cn(
          'rounded-lg border p-4',
          !(result && result.placements.length > 1) &&
            'pointer-events-none opacity-50',
        )}
      >
        <RangeSlider
          label="積む順に見る"
          value={visible ?? result?.placements.length ?? 0}
          min={0}
          max={result?.placements.length ?? 0}
          step={1}
          unit={` / ${result?.placements.length ?? 0} 個`}
          onChange={(v) =>
            setVisible(v === result?.placements.length ? null : v)
          }
        />
      </div>

      {/* 床と積み方 */}
      <section className="space-y-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">床と積み方</h2>
          <span className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetAll}
            >
              <RotateCcw />
              設定をすべて初期値に戻す
            </Button>
            <HelpTip>
              床・積み方・箱のリスト・ランダム生成・3D
              の表示の設定を、すべて初期値に戻します。保存した結果は消しません。設定はブラウザに保存しているので、ページを読み込み直しても残ります。
            </HelpTip>
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            label="床の幅 X（mm）"
            help="箱を置く床（棚・押し入れ・荷台など）の左右の長さです。"
            min={1}
            max={MAX_SIZE}
            value={settings.floorX}
            onChange={(v) => set('floorX', v)}
          />
          <NumberField
            label="床の奥行き Y（mm）"
            help="箱を置く床の、手前から奥までの長さです。"
            min={1}
            max={MAX_SIZE}
            value={settings.floorY}
            onChange={(v) => set('floorY', v)}
          />
          <fieldset className="space-y-2">
            <legend className="flex items-center gap-1 text-sm">
              壁（手前には置けません）
              <HelpTip>
                床のどの辺に壁があるかを選びます。壁があると、その壁側から詰め、全体の重心を壁側に少し寄せます。手前は荷物を出し入れする側なので、壁は置けません。
              </HelpTip>
            </legend>
            <div className="flex gap-4 pt-1 text-sm">
              {(
                [
                  ['back', '奥'],
                  ['left', '左'],
                  ['right', '右'],
                ] as const satisfies readonly [keyof Walls, string][]
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.walls[key]}
                    onChange={(e) =>
                      set('walls', {
                        ...settings.walls,
                        [key]: e.target.checked,
                      })
                    }
                    className="size-4 accent-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <RangeSlider
            label="箱どうしのすき間"
            help="横に並べる箱の間にあけるすき間です。段ボールはぴったりくっつけられないので、その分の余裕を取ります。上下に重ねる箱の間にはあけません。"
            value={settings.gap}
            min={0}
            max={50}
            step={1}
            unit=" mm"
            onChange={(v) => set('gap', v)}
          />
          <RangeSlider
            label="箱と床の端・壁とのすき間"
            help="床の端や壁と、箱の間にあけるすき間です。"
            value={settings.edgeGap}
            min={0}
            max={50}
            step={1}
            unit=" mm"
            onChange={(v) => set('edgeGap', v)}
          />
          <RangeSlider
            label="底面を支える割合"
            help="上に載せる箱の底面のうち、下の箱で支えられていないといけない割合です。100% なら、はみ出して載せることはしません。下げるほど詰めやすくなりますが、不安定になります。"
            value={settings.supportPercent}
            min={50}
            max={100}
            step={5}
            unit="% 以上"
            onChange={(v) => set('supportPercent', v)}
          />
          <fieldset className="space-y-2">
            <legend className="flex items-center gap-1 text-sm">
              優先すること
              <HelpTip>
                「全体の高さを低く」は、積み上がった高さがいちばん低くなる並べ方を探します。「下の段から隙間なく」は、床に直接置く
                1 段目をなるべく埋めることを優先します。
              </HelpTip>
            </legend>
            <div className="inline-flex rounded-md border p-0.5">
              {(
                [
                  ['height', '全体の高さを低く'],
                  ['floor', '下の段から隙間なく'],
                ] as const satisfies readonly [Objective, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={settings.objective === value}
                  onClick={() => set('objective', value)}
                  className={cn(
                    'rounded px-3 py-1 text-xs text-muted-foreground',
                    settings.objective === value && 'bg-muted text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <div
            className={cn(
              !(
                settings.walls.back ||
                settings.walls.left ||
                settings.walls.right
              ) && 'opacity-50',
            )}
          >
            <RangeSlider
              label="重心を壁側に寄せる強さ"
              help="壁があるとき、全体の重心をどれだけ壁側に寄せるかです。強くするほど、箱のかたまりが壁際に集まり、手前に高い山ができにくくなります。壁がないときは、重心を床の中心に近づけます。"
              value={settings.wallBias}
              min={0}
              max={100}
              step={10}
              format={(v) =>
                v === 0 ? 'なし' : v <= 30 ? '弱' : v <= 70 ? '中' : '強'
              }
              onChange={(v) => set('wallBias', v)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              壁がないときは、重心を床の中心に近づけます。
            </p>
          </div>
        </div>
      </section>

      {/* 箱のリスト */}
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">箱（全部で {total} 個）</h2>
          <span className="flex items-center gap-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                ref={layDownAllRef}
                type="checkbox"
                checked={allLayDown}
                onChange={(e) =>
                  set(
                    'boxes',
                    settings.boxes.map((b) => ({
                      ...b,
                      canLayDown: e.target.checked,
                    })),
                  )
                }
                className="size-4 accent-primary"
              />
              すべての箱に横倒しを許可
              {someLayDown && !allLayDown && (
                <span className="text-xs text-muted-foreground">（混在）</span>
              )}
            </label>
            <HelpTip>
              すべての箱の「横倒し」をまとめてオン・オフします。許可は「倒してもよい」という意味で、倒したほうが良く積めるときだけ倒します。倒すときに上へ向けるのは、元の「前」か「左」の面だけです。
            </HelpTip>
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          X・Y・Z
          は、そのまま置いたときの幅・奥行き・高さです。横倒しの許可をオンにすると、倒したほうが良いときだけ倒します。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-2 font-normal">
                  <span className="flex items-center gap-1">
                    使う
                    <HelpTip>
                      オフにした箱は、リストに残したまま積み上げの計算から外します。入れる箱を選び直すときに使います。
                    </HelpTip>
                  </span>
                </th>
                <th className="py-1 font-normal">
                  <span className="flex items-center gap-1">
                    タグ
                    <HelpTip>
                      何の箱か分かるための名前です（例：冬服、食器）。3D
                      の箱の面に表示し、同じタグの箱は同じ色になります。空のときは「箱
                      1」のように番号で呼びます。
                    </HelpTip>
                  </span>
                </th>
                <th className="py-1 font-normal">
                  <span className="flex items-center gap-1">
                    X 幅（mm）
                    <HelpTip>そのまま置いたときの、左右の長さです。</HelpTip>
                  </span>
                </th>
                <th className="py-1 font-normal">
                  <span className="flex items-center gap-1">
                    Y 奥行き（mm）
                    <HelpTip>
                      そのまま置いたときの、手前から奥までの長さです。
                    </HelpTip>
                  </span>
                </th>
                <th className="py-1 font-normal">
                  <span className="flex items-center gap-1">
                    Z 高さ（mm）
                    <HelpTip>
                      そのまま置いたときの高さです。横倒しを許可しないときは、この辺がいつも上を向きます。
                    </HelpTip>
                  </span>
                </th>
                <th className="py-1 font-normal">
                  <span className="flex items-center gap-1">
                    個数
                    <HelpTip>同じ寸法の箱がいくつあるかです。</HelpTip>
                  </span>
                </th>
                <th className="py-1 font-normal">
                  <span className="flex items-center gap-1">
                    横倒し
                    <HelpTip>
                      オンにすると、この箱を横に倒して置いてもよいことにします。倒したほうが良く積めるときだけ倒し、上へ向けるのは元の「前」か「左」の面だけです。
                    </HelpTip>
                  </span>
                </th>
                <th className="py-1">
                  <span className="sr-only">削除</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {settings.boxes.map((b, i) => (
                <tr
                  key={b.id}
                  className={cn(
                    'border-t',
                    !b.enabled && '[&_td:not(:first-child)]:opacity-40',
                  )}
                >
                  <td className="py-1.5 pr-2 text-center">
                    <input
                      type="checkbox"
                      aria-label="積み上げに使う"
                      checked={b.enabled}
                      onChange={(e) =>
                        setBox(b.id, { enabled: e.target.checked })
                      }
                      className="size-4 accent-primary"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-3 shrink-0 rounded-sm"
                        style={{ background: `hsl(${formHues[i]} 60% 62%)` }}
                      />
                      <Input
                        aria-label="タグ"
                        value={b.tag}
                        maxLength={40}
                        placeholder={`箱 ${i + 1}`}
                        onChange={(e) => setBox(b.id, { tag: e.target.value })}
                        className="h-8 min-w-28"
                      />
                    </div>
                  </td>
                  {(['x', 'y', 'z'] as const).map((key) => (
                    <td key={key} className="py-1.5 pr-2">
                      <Input
                        aria-label={
                          { x: 'X 幅', y: 'Y 奥行き', z: 'Z 高さ' }[key]
                        }
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={MAX_SIZE}
                        value={b[key]}
                        onChange={(e) =>
                          setBox(b.id, { [key]: toInt(e.target.value) })
                        }
                        className={numberInput}
                      />
                    </td>
                  ))}
                  <td className="py-1.5 pr-2">
                    <Input
                      aria-label="個数"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={MAX_COUNT_PER_ROW}
                      value={b.count}
                      onChange={(e) =>
                        setBox(b.id, { count: toInt(e.target.value) })
                      }
                      className={cn(numberInput, 'w-16')}
                    />
                  </td>
                  <td className="py-1.5 pr-2 text-center">
                    <input
                      type="checkbox"
                      aria-label="横倒しを許可"
                      checked={b.canLayDown}
                      onChange={(e) =>
                        setBox(b.id, { canLayDown: e.target.checked })
                      }
                      className="size-4 accent-primary"
                    />
                  </td>
                  <td className="py-1.5 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="この箱を消す"
                      disabled={settings.boxes.length <= 1}
                      onClick={() =>
                        set(
                          'boxes',
                          settings.boxes.filter((x) => x.id !== b.id),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={settings.boxes.length >= MAX_ROWS}
          onClick={() =>
            set('boxes', [
              ...settings.boxes,
              row({
                tag: '',
                x: 300,
                y: 200,
                z: 200,
                count: 1,
                canLayDown: false,
              }),
            ])
          }
        >
          <Plus />
          箱の種類を足す
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* ランダム生成 */}
        <div className="space-y-3 rounded-md bg-muted/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">テスト用のランダムな箱</span>
            <Button type="button" size="sm" onClick={() => generate('replace')}>
              <Dices />
              作って置き換える
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => generate('append')}
            >
              作って後ろに足す
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setRandom({ seed: Math.floor(Math.random() * 1_000_000) })
              }
            >
              番号を変える
            </Button>
          </div>
          <NumberField
            label="番号（同じ番号なら同じ箱を作ります）"
            help="ランダムな箱を作るときの種です。同じ番号と同じ設定なら、何度作っても同じ箱になります。番号は JSON の書き出しにも入ります。"
            inline
            min={0}
            max={999999}
            value={settings.random.seed}
            onChange={(v) => setRandom({ seed: Math.max(0, v || 0) })}
          />
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">
              詳しく
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <RangeSlider
                label="箱の種類の数"
                help="ランダムに作る箱の寸法の種類です。"
                value={settings.random.types}
                min={1}
                max={20}
                step={1}
                unit=" 種類"
                onChange={(v) => setRandom({ types: v })}
              />
              <RangeSlider
                label="全部の個数"
                help="ランダムに作る箱の個数の合計です。どの種類も 1 個以上になるよう配ります。"
                value={settings.random.total}
                min={1}
                max={MAX_TOTAL}
                step={1}
                unit=" 個"
                onChange={(v) => setRandom({ total: v })}
              />
              <RangeSlider
                label="横倒しを許可する割合"
                help="作った箱のうち、横倒しを許可する箱の割合のおおよその目安です。"
                value={settings.random.layDownPercent}
                min={0}
                max={100}
                step={10}
                unit="%"
                onChange={(v) => setRandom({ layDownPercent: v })}
              />
              <NumberField
                label="1 辺の長さの最小（mm）"
                help="作る箱の、1 辺の長さの下限です。"
                min={5}
                max={MAX_SIZE}
                value={settings.random.min}
                onChange={(v) => setRandom({ min: v })}
              />
              <NumberField
                label="1 辺の長さの最大（mm）"
                help="作る箱の、1 辺の長さの上限です。床からはみ出さないよう、幅・奥行きは床の大きさまでに抑えます。"
                min={5}
                max={MAX_SIZE}
                value={settings.random.max}
                onChange={(v) => setRandom({ max: v })}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              床からはみ出さないよう、X・Y
              は床の幅・奥行きから端のすき間を引いた長さまでにします。
            </p>
          </details>
        </div>
      </section>

      {/* 書き出し・読み込み */}
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">書き出し・読み込み</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!result}
            onClick={() =>
              result &&
              download(
                'box-packing.csv',
                new Blob([placementsCsv(shownBoxes, result.placements)], {
                  type: 'text/csv',
                }),
              )
            }
          >
            <Download />
            置き場所（CSV）
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              download(
                'box-packing.json',
                new Blob(
                  [exportJson(current?.settings ?? settings, result ?? null)],
                  {
                    type: 'application/json',
                  },
                ),
              )
            }
          >
            <FileJson />
            設定と結果（JSON）
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!result}
            onClick={async () => {
              const blob = await captureRef.current?.()
              if (blob) download('box-packing.png', blob)
            }}
          >
            <ImageDown />
            3D 表示（PNG）
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            <Upload />
            JSON から設定を読み込む
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importFile(file)
              e.target.value = ''
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          書き出すのは、いま表示している候補です。計算も書き出しもブラウザの中だけで行い、入力した内容はどこにも送りません。
        </p>
      </section>

      {/* 置き場所の一覧 */}
      {result && result.placements.length > 0 && (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer font-semibold">
            置き場所の一覧（{result.placements.length} 個）
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            行を選ぶと、3D の中のその箱を目立たせます。x は左から、y
            は手前から、z は床からの位置です。
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-normal">#</th>
                  <th className="py-1 font-normal">タグ</th>
                  <th className="py-1 font-normal">位置 x, y, z（mm）</th>
                  <th className="py-1 font-normal">置いた向きの寸法（mm）</th>
                  <th className="py-1 font-normal">上を向いている面</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {result.placements.map((p, i) => (
                  <tr
                    // biome-ignore lint/suspicious/noArrayIndexKey: 置いた順番そのものが識別子
                    key={i}
                    tabIndex={0}
                    aria-selected={selected === i}
                    onClick={() => setSelected(selected === i ? null : i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelected(selected === i ? null : i)
                      }
                    }}
                    className={cn(
                      'cursor-pointer border-t hover:bg-muted/50',
                      selected === i && 'bg-amber-100 dark:bg-amber-900/40',
                    )}
                  >
                    <td className="py-1">{i + 1}</td>
                    <td className="py-1 font-sans">
                      <span
                        aria-hidden
                        className="mr-2 inline-block size-3 rounded-sm align-middle"
                        style={{ background: `hsl(${hues[p.type]} 60% 62%)` }}
                      />
                      {names[p.type]}
                    </td>
                    <td className="py-1">
                      {p.x}, {p.y}, {p.z}
                    </td>
                    <td className="py-1">
                      {p.w} × {p.d} × {p.h}
                    </td>
                    <td className="py-1 font-sans">
                      {p.faces[4]}
                      {p.laidDown && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          （横倒し）
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}
