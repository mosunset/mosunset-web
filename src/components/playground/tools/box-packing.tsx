import {
  Dices,
  Download,
  FileJson,
  ImageDown,
  Play,
  Plus,
  RotateCcw,
  Save,
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
import type { GpuReply, GpuRequest } from './box-packing-gpu.worker'
import {
  BestResults,
  SavedResults,
  type SettingsSummary,
} from './box-packing-saved'
import {
  type BoxSpec,
  betterFor,
  type Genome,
  type Metric,
  measureTidiness,
  metricLabels,
  metrics,
  type Objective,
  type PackInput,
  type PackResult,
  type Placement,
  random,
  type Walls,
} from './box-packing-solver'
import {
  buildCombos,
  comboChips,
  defaultSweep,
  MAX_SEARCH_MS,
  planSearch,
  RangeOrValue,
  SearchBar,
  SLICE_SEC,
  type SweepConfig,
  type SweepRow,
  SweepTable,
} from './box-packing-sweep'
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
  tidy: {
    weight: 50,
    group: true,
    flat: true,
    bigBottom: true,
    upright: true,
    even: true,
  },
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
    tidy: (() => {
      const t = (s.tidy ?? {}) as Record<string, unknown>
      const flag = (
        key: 'group' | 'flat' | 'bigBottom' | 'upright' | 'even',
      ) =>
        typeof t[key] === 'boolean' ? (t[key] as boolean) : initial.tidy[key]
      return {
        weight: num(t.weight, initial.tidy.weight, 0, 100),
        group: flag('group'),
        flat: flag('flat'),
        bigBottom: flag('bigBottom'),
        upright: flag('upright'),
        even: flag('even'),
      }
    })(),
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
  bests: 'mosunset:box-packing:bests',
  gpu: 'mosunset:box-packing:gpu',
  sweep: 'mosunset:box-packing:sweep',
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
        result: withTidiness(r, settings),
      })
    } catch {
      // 壊れた 1 件は飛ばす
    }
  }
  return out
}

/**
 * 床の X・Y と箱（寸法・個数・使うかどうか）のまとまりを表す文字列。
 * これが同じ結果どうしを、ほかの設定が違っても比べる。
 * タグは名札なので入れない。幅と奥行きは床の上で 90° 回せるので、入れ替わっても同じ箱とみなす
 */
function groupKeyOf(s: Settings) {
  const boxes = s.boxes
    .filter((b) => b.enabled && b.count > 0)
    .map((b) => `${Math.min(b.x, b.y)}x${Math.max(b.x, b.y)}x${b.z}*${b.count}`)
    .sort()
  return `${s.floorX}x${s.floorY}|${boxes.join(',')}`
}

/** 部門別のいちばん 1 件 */
type BestEntry = {
  run: number
  /** 範囲でまとめて試したときの組み合わせの番号（1 から） */
  sweep?: number
  foundAt: number
  settings: Settings
  result: PackResult
}

/** 床と箱のまとまりごとの、部門別のいちばん */
type BestGroup = {
  updatedAt: number
  entries: Partial<Record<Metric, BestEntry>>
}

/** 記録しておく、床と箱のまとまりの数（古いものから消す） */
const MAX_BEST_GROUPS = 10

/** 前の版で保存した結果には見た目の整いがないので、0 で補う */
/** 保存した結果の整いを、今の測り方で測り直す（測り方を変えても、比べ方がずれないように） */
function withTidiness(r: PackResult, settings: Settings): PackResult {
  try {
    return {
      ...r,
      tidiness: measureTidiness(r.placements, toInput(settings, 0)),
    }
  } catch {
    return { ...r, tidiness: typeof r.tidiness === 'number' ? r.tidiness : 0 }
  }
}

function isResult(r: unknown): r is PackResult {
  const x = r as PackResult | null
  const isNumber = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
  return (
    !!x &&
    Array.isArray(x.placements) &&
    Array.isArray(x.unplaced) &&
    [x.height, x.fillRate, x.floorCoverage].every(isNumber)
  )
}

function loadBests(): Record<string, BestGroup> {
  const data = readStorage(STORAGE.bests) as Record<string, unknown> | null
  if (!data || typeof data !== 'object') return {}
  const out: Record<string, BestGroup> = {}
  for (const [key, value] of Object.entries(data)) {
    const g = value as {
      updatedAt?: unknown
      entries?: Record<string, unknown>
    }
    if (!g || typeof g !== 'object' || !g.entries) continue
    const entries: Partial<Record<Metric, BestEntry>> = {}
    for (const metric of metrics) {
      const e = g.entries[metric] as Record<string, unknown> | undefined
      if (!e) continue
      const settings = parseSettingsObject(e.settings)
      if (!settings || !isResult(e.result)) continue
      entries[metric] = {
        run: typeof e.run === 'number' ? e.run : 1,
        sweep: typeof e.sweep === 'number' ? e.sweep : undefined,
        foundAt: typeof e.foundAt === 'number' ? e.foundAt : Date.now(),
        settings,
        result: withTidiness(e.result, settings),
      }
    }
    out[key] = {
      updatedAt: typeof g.updatedAt === 'number' ? g.updatedAt : 0,
      entries,
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
      label: '整い',
      value:
        s.tidy.weight === 0
          ? 'なし'
          : `${s.tidy.weight}（${[
              s.tidy.group && 'まとまり',
              s.tidy.flat && '平ら',
              s.tidy.bigBottom && '大が下',
              s.tidy.upright && '横倒し少',
              s.tidy.even && 'でこぼこ無',
            ]
              .filter(Boolean)
              .join('・')}）`,
    },
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

const percent = (v: number) => (v * 100).toFixed(1)

// ---- 計算を動かす ----

/**
 * 部門別ベストに 1 件足す（その部門で前より良いときだけ）。
 * 変わらなければ同じオブジェクトを返すので、画面を描き直さずに済む
 */
function withBest(
  all: Record<string, BestGroup>,
  key: string,
  metric: Metric,
  entry: BestEntry,
): Record<string, BestGroup> {
  const group = all[key]
  const lowest = group?.entries.height?.result.height
  if (!betterFor(metric, entry.result, group?.entries[metric]?.result, lowest))
    return all
  const entries = { ...group?.entries, [metric]: entry }
  // いちばん低い結果が変わると、「見た目がいちばん整っている」部門の対象になる高さの幅も変わる
  if (
    metric === 'height' &&
    betterFor('tidy', entry.result, entries.tidy?.result, entry.result.height)
  ) {
    entries.tidy = entry
  }
  const next = {
    ...all,
    [key]: { updatedAt: Date.now(), entries },
  }
  // 古いまとまりから消して、数を抑える
  const keys = Object.keys(next).sort(
    (a, b) => next[b].updatedAt - next[a].updatedAt,
  )
  for (const old of keys.slice(MAX_BEST_GROUPS)) delete next[old]
  return next
}

/**
 * GPU 係が 1 回に 1 つの組み合わせを受け持つ時間。GPU は数千〜数万通りをまとめて数秒かけて評価するので、
 * CPU の係（SLICE_SEC）より長くする
 */
const GPU_SLICE_MS = 15_000

/** Worker を 1 つ動かして、1 つの組み合わせを計算する。止める関数を返す */
function runWorker(
  input: PackInput,
  on: {
    best: (result: PackResult) => void
    metric: (metric: Metric, result: PackResult) => void
    progress: (tried: number) => void
    /** 良い結果が出なくなって止まった、または失敗した */
    done: () => void
  },
) {
  const worker = new Worker(
    new URL('./box-packing.worker.ts', import.meta.url),
    {
      type: 'module',
    },
  )
  let stopped = false
  const stop = () => {
    stopped = true
    worker.terminate()
  }
  worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
    if (stopped) return
    const message = event.data
    on.progress(message.tried)
    if (message.kind === 'best') on.best(message.result)
    else if (message.kind === 'metric')
      on.metric(message.metric, message.result)
    else if (message.kind === 'done') {
      stop()
      on.done()
    }
  }
  worker.onerror = () => {
    if (stopped) return
    stop()
    on.done()
  }
  worker.postMessage(input)
  return stop
}

/** 範囲でまとめて試す設定を、ブラウザから読む（足りない値は初期値で補う） */
function loadSweep(): SweepConfig {
  const v = readStorage(STORAGE.sweep) as Partial<SweepConfig> | null
  if (!v || typeof v !== 'object') return defaultSweep
  const range = (
    key: 'gap' | 'edgeGap' | 'supportPercent' | 'wallBias' | 'tidyWeight',
  ) => {
    const r = v[key] as Partial<SweepConfig['gap']> | undefined
    const d = defaultSweep[key]
    const n = (x: unknown, fallback: number) =>
      typeof x === 'number' && Number.isFinite(x) ? Math.trunc(x) : fallback
    return {
      on: typeof r?.on === 'boolean' ? r.on : d.on,
      min: n(r?.min, d.min),
      max: n(r?.max, d.max),
      step: Math.max(1, n(r?.step, d.step)),
    }
  }
  return {
    gap: range('gap'),
    edgeGap: range('edgeGap'),
    supportPercent: range('supportPercent'),
    wallBias: range('wallBias'),
    tidyWeight: range('tidyWeight'),
    bothObjectives:
      typeof v.bothObjectives === 'boolean'
        ? v.bothObjectives
        : defaultSweep.bothObjectives,
    bothLayDown:
      typeof v.bothLayDown === 'boolean'
        ? v.bothLayDown
        : defaultSweep.bothLayDown,
  }
}

/** 部門別ベストを 3D で横に並べる */
function BestViews3D({
  entries,
  view,
}: {
  entries: { metric: Metric; entry: BestEntry | undefined }[]
  view: ViewOptions
}) {
  // 書き出しには使わないが、部品が受け取る形に合わせて用意する
  // 部門の数だけ用意する（部門を増やしても足りなくならないように、部門の一覧から作る）
  const refs = useRef(
    metrics.map(
      () =>
        ({ current: null }) as { current: (() => Promise<Blob | null>) | null },
    ),
  ).current
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {entries.map(({ metric, entry }, i) => (
        <div key={metric} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">{metricLabels[metric]}</span>
            {entry && (
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {entry.result.height.toLocaleString()} mm・1 段目{' '}
                {percent(entry.result.floorCoverage)}%
              </span>
            )}
          </div>
          {entry ? (
            <BestView3D entry={entry} view={view} captureRef={refs[i]} />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
              まだ記録がありません
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function BestView3D({
  entry,
  view,
  captureRef,
}: {
  entry: BestEntry
  view: ViewOptions
  captureRef: React.RefObject<(() => Promise<Blob | null>) | null>
}) {
  const boxes = entry.settings.boxes
  const names = useMemo(() => boxes.map((_, i) => nameOf(boxes, i)), [boxes])
  const hues = useMemo(() => huesOf(boxes), [boxes])
  return (
    <PackingView
      {...view}
      compact
      floorX={entry.settings.floorX}
      floorY={entry.settings.floorY}
      walls={entry.settings.walls}
      height={entry.result.height}
      placements={entry.result.placements}
      names={names}
      hues={hues}
      cog={entry.result.cog}
      selected={null}
      onSelect={noop}
      captureRef={captureRef}
    />
  )
}

const noop = () => {}

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
  const [bests, setBests] = useState<Record<string, BestGroup>>(loadBests)
  const [sweepConfig, setSweepConfig] = useState<SweepConfig>(loadSweep)
  /**
   * 詳しく見る結果。'best:height' などの部門別ベスト、'sweep:3' などの試した組み合わせ、
   * または保存した結果の id。null なら「いちばん低い」部門別ベスト
   */
  const [viewing, setViewing] = useState<string | null>(null)
  const [progress, setProgress] = useState({ tried: 0, elapsed: 0 })
  const [visible, setVisible] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  /** 何回目の「探す」か（部門別ベストの「#1」などに出す） */
  const [searchNo, setSearchNo] = useState(0)
  /** 探している状態（combos は試す設定の一覧、rows は進み具合と結果） */
  const [search, setSearch] = useState<{
    running: boolean
    combos: Settings[]
    rows: SweepRow[]
    /** 始めた時刻（探すたびに変わるので、前の探索からの遅れた知らせを見分けるのにも使う） */
    startedAt: number
    /** 「続けて詰める」のときの出発点の並べ順 */
    startOrder?: number[]
    /** 「続けて詰める」のときの出発点の並べ方（置く単位とルール） */
    startGenome?: Genome
  }>({ running: false, combos: [], rows: [], startedAt: 0 })
  /** 経過時間の表示を進めるための時計 */
  const [now, setNow] = useState(() => Date.now())
  /** GPU（WebGPU）を使うか（使える環境のときだけ効く） */
  const [useGpu, setUseGpu] = useState(() => readStorage(STORAGE.gpu) !== false)
  const [gpu, setGpu] = useState<{
    status: 'checking' | 'ready' | 'unavailable'
    description?: string
  }>({ status: 'checking' })
  /** GPU 係の Worker（ページを開いているあいだ 1 つだけ動かし続ける）と、頼みごとごとの返事の受け取り先 */
  const gpuWorkerRef = useRef<Worker | null>(null)
  const gpuHandlersRef = useRef(new Map<number, (reply: GpuReply) => void>())
  const gpuTokenRef = useRef(0)

  // GPU 係を用意し、GPU が使えるかを確かめる
  useEffect(() => {
    if (!('gpu' in navigator)) {
      setGpu({ status: 'unavailable' })
      return
    }
    const w = new Worker(
      new URL('./box-packing-gpu.worker.ts', import.meta.url),
      {
        type: 'module',
      },
    )
    gpuWorkerRef.current = w
    w.onmessage = (event: MessageEvent<GpuReply>) => {
      const reply = event.data
      if (reply.kind === 'ready')
        setGpu({ status: 'ready', description: reply.description })
      else if (reply.kind === 'unavailable') setGpu({ status: 'unavailable' })
      gpuHandlersRef.current.get(reply.token)?.(reply)
    }
    w.onerror = () => setGpu({ status: 'unavailable' })
    w.postMessage({ type: 'probe' } satisfies GpuRequest)
    return () => {
      w.terminate()
      gpuWorkerRef.current = null
    }
  }, [])
  useEffect(() => {
    writeStorage(STORAGE.gpu, useGpu)
  }, [useGpu])
  const gpuOn = useGpu && gpu.status === 'ready'
  const [showBest3D, setShowBest3D] = useState(true)
  const captureRef = useRef<(() => Promise<Blob | null>) | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const layDownAllRef = useRef<HTMLInputElement>(null)
  const detailsRef = useRef<HTMLElement>(null)

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }))
  const setBox = (id: number, patch: Partial<Omit<BoxRow, 'id'>>) =>
    setSettings((s) => ({
      ...s,
      boxes: s.boxes.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }))
  const setRandom = (patch: Partial<RandomOptions>) =>
    setSettings((s) => ({ ...s, random: { ...s.random, ...patch } }))
  const setRange = <
    K extends 'gap' | 'edgeGap' | 'supportPercent' | 'wallBias' | 'tidyWeight',
  >(
    key: K,
    r: SweepConfig[K],
  ) => setSweepConfig((c) => ({ ...c, [key]: r }))

  const error = validate(settings)

  // ---- 探す ----
  const sweepBase = {
    gap: settings.gap,
    edgeGap: settings.edgeGap,
    supportPercent: settings.supportPercent,
    wallBias: settings.wallBias,
    tidyWeight: settings.tidy.weight,
    objective: settings.objective,
  }
  const plan = planSearch(sweepConfig, sweepBase, workerCount)

  /** 条件の組み合わせを作って探し始める。from を渡すと、その結果 1 つから続けて詰める */
  const startSearch = (from?: { settings: Settings; result: PackResult }) => {
    let combos: Settings[]
    let chips: string[][]
    if (from) {
      combos = [from.settings]
      chips = [['続けて詰める']]
    } else {
      const picked = buildCombos(sweepConfig, sweepBase)
      combos = picked.map((c) => ({
        ...settings,
        gap: c.gap,
        edgeGap: c.edgeGap,
        supportPercent: c.supportPercent,
        wallBias: c.wallBias,
        tidy: { ...settings.tidy, weight: c.tidyWeight },
        objective: c.objective,
        boxes: c.layDownAll
          ? settings.boxes.map((b) => ({ ...b, canLayDown: true }))
          : settings.boxes,
      }))
      chips = picked.map((c) => comboChips(sweepConfig, c))
    }
    setSearchNo((n) => n + 1)
    setProgress({ tried: 0, elapsed: 0 })
    setNow(Date.now())
    setSearch({
      running: true,
      combos,
      rows: chips.map((c) => ({ chips: c, visits: 0, active: 0 })),
      startedAt: Date.now(),
      startOrder: from?.result.placements.map((p) => p.type),
      startGenome: from?.result.genome,
    })
  }

  const stopSearch = () =>
    setSearch((s) => ({
      ...s,
      running: false,
      rows: s.rows.map((r) => ({ ...r, active: 0 })),
    }))

  // Worker ごとに別の組み合わせを SLICE_SEC だけ計算し、終わったら次の組み合わせをランダムに選び直す
  // （計算した回数が少ないものを優先）。同じ組み合わせにまた当たったら、前に見つけた良い並べ方の続きから詰める。
  // 止めるまで続け、MAX_SEARCH_MS たったら自動で止める
  // biome-ignore lint/correctness/useExhaustiveDependencies: 探し始めたとき（startedAt が変わったとき）だけ動かす
  useEffect(() => {
    if (!search.running) return
    const startedAt = search.startedAt
    const combos = search.combos
    const n = combos.length
    const runNo = searchNo
    const visits = new Array<number>(n).fill(0)
    const active = new Array<number>(n).fill(0)
    const bestScore = new Array<number | undefined>(n).fill(undefined)
    const bestOrder = new Array<number[] | undefined>(n).fill(undefined)
    if (search.startOrder) bestOrder[0] = search.startOrder
    const bestGenome = new Array<Genome | undefined>(n).fill(undefined)
    if (search.startGenome) bestGenome[0] = search.startGenome
    // 組み合わせとして成り立たないもの（床が端のすき間より狭いなど）は選ばない
    const usable = combos
      .map((c, i) => (validate(c) ? -1 : i))
      .filter((i) => i >= 0)
    const stops = new Array<(() => void) | null>(workerCount).fill(null)
    // GPU を使うときは、計算係のうち 1 つ（0 番）を GPU 係にする
    const gpuWorker = gpuOn ? gpuWorkerRef.current : null
    const runGpu: typeof runWorker = (job, on) => {
      const w = gpuWorker
      if (!w) return runWorker(job, on)
      const token = ++gpuTokenRef.current
      gpuHandlersRef.current.set(token, (reply) => {
        if (reply.kind === 'best') on.best(reply.result)
        else if (reply.kind === 'metric') on.metric(reply.metric, reply.result)
        else if (reply.kind === 'done') {
          gpuHandlersRef.current.delete(token)
          on.done()
        }
        if ('tried' in reply) on.progress(reply.tried)
      })
      w.postMessage({
        type: 'run',
        token,
        input: job,
        durationMs: MAX_SEARCH_MS,
      } satisfies GpuRequest)
      return () => {
        gpuHandlersRef.current.delete(token)
        w.postMessage({ type: 'stop', token } satisfies GpuRequest)
      }
    }
    const slotTried = new Array<number>(workerCount).fill(0)
    let finishedTried = 0
    let lastProgress = 0
    let ended = false

    const patchRow = (i: number, patch: (r: SweepRow) => SweepRow) =>
      setSearch((s) => {
        if (s.startedAt !== startedAt) return s
        const rows = [...s.rows]
        rows[i] = patch(rows[i])
        return { ...s, rows }
      })

    /** 次に計算する組み合わせ（計算中を含めた回数がいちばん少ないものから、ランダムに 1 つ） */
    const pick = () => {
      let min = Number.POSITIVE_INFINITY
      let choices: number[] = []
      for (const i of usable) {
        const load = visits[i] + active[i]
        if (load < min) {
          min = load
          choices = [i]
        } else if (load === min) choices.push(i)
      }
      return choices.length > 0
        ? choices[Math.floor(Math.random() * choices.length)]
        : -1
    }

    const launch = (slot: number) => {
      if (ended) return
      const i = pick()
      if (i < 0) return
      active[i]++
      patchRow(i, (r) => ({ ...r, active: active[i] }))
      const { seed: _seed, ...input } = toInput(combos[i], 0)
      let finished = false
      let timer = 0
      const finish = () => {
        if (finished) return
        finished = true
        window.clearTimeout(timer)
        stops[slot]?.()
        stops[slot] = null
        finishedTried += slotTried[slot]
        slotTried[slot] = 0
        active[i]--
        visits[i]++
        patchRow(i, (r) => ({ ...r, active: active[i], visits: visits[i] }))
        launch(slot)
      }
      stops[slot] = (slot === 0 && gpuWorker ? runGpu : runWorker)(
        {
          ...input,
          seed: Math.floor(Math.random() * 1_000_000_000),
          startOrder: bestOrder[i],
          startGenome: bestGenome[i],
        },
        {
          best: (found) => {
            const prev = bestScore[i]
            if (prev === undefined || found.score < prev) {
              bestScore[i] = found.score
              bestOrder[i] = found.placements.map((p) => p.type)
              bestGenome[i] = found.genome
            }
          },
          metric: (metric, found) => {
            setBests((all) =>
              withBest(all, groupKeyOf(combos[i]), metric, {
                run: runNo,
                sweep: n > 1 ? i + 1 : undefined,
                foundAt: Date.now(),
                settings: combos[i],
                result: found,
              }),
            )
            patchRow(i, (r) => {
              let next = r
              if (metric === 'height' && betterFor('height', found, r.lowest)) {
                next = { ...next, lowest: found }
              }
              // 1 段目の埋まり方は部門にしないが、試した組み合わせの表には出す
              if (found.floorCoverage > (next.bestFloor ?? -1)) {
                next = { ...next, bestFloor: found.floorCoverage }
              }
              if (
                metric === 'low' &&
                found.cog &&
                found.cog.z < (next.bestCogZ ?? Number.POSITIVE_INFINITY)
              ) {
                next = { ...next, bestCogZ: found.cog.z }
              }
              return next
            })
          },
          progress: (tried) => {
            slotTried[slot] = tried
            const t = Date.now()
            if (t - lastProgress < 300) return
            lastProgress = t
            setProgress({
              tried: finishedTried + slotTried.reduce((x, y) => x + y, 0),
              elapsed: t - startedAt,
            })
          },
          done: finish,
        },
      )
      // 組み合わせが 1 つだけなら区切らずに探し続ける（良い結果が出なくなったら、良い並べ方から再開）
      timer = window.setTimeout(
        finish,
        n > 1
          ? slot === 0 && gpuWorker
            ? GPU_SLICE_MS
            : SLICE_SEC * 1000
          : MAX_SEARCH_MS,
      )
    }

    if (usable.length === 0) {
      setSearch((s) => ({ ...s, running: false }))
      toast.error(
        '試せる組み合わせがありません（床が、端のすき間より狭くなっていないか確かめてください）',
      )
      return
    }
    for (let slot = 0; slot < workerCount; slot++) launch(slot)
    // 止めなかったときは 1 時間で止める
    const limit = window.setTimeout(() => {
      setSearch((s) =>
        s.startedAt === startedAt
          ? {
              ...s,
              running: false,
              rows: s.rows.map((r) => ({ ...r, active: 0 })),
            }
          : s,
      )
      toast.success(
        '1 時間たったので、探すのを止めました（結果は部門別ベストに入っています）',
      )
    }, MAX_SEARCH_MS)
    // 経過時間の表示を進める
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      ended = true
      window.clearTimeout(limit)
      window.clearInterval(clock)
      for (const stop of stops) stop?.()
    }
  }, [search.running, search.startedAt])

  const elapsedMs = search.running ? Math.max(0, now - search.startedAt) : 0
  const avgVisits =
    search.rows.length > 0
      ? search.rows.reduce((sum, r) => sum + r.visits, 0) / search.rows.length
      : 0
  const activeCount = search.rows.filter((r) => r.active > 0).length

  // ---- ブラウザへの保存 ----
  const allLayDown = settings.boxes.every((b) => b.canLayDown)
  const someLayDown = settings.boxes.some((b) => b.canLayDown)
  useEffect(() => {
    if (layDownAllRef.current) {
      layDownAllRef.current.indeterminate = someLayDown && !allLayDown
    }
  }, [someLayDown, allLayDown])

  useEffect(() => {
    writeStorage(STORAGE.settings, serializeSettings(settings))
  }, [settings])
  useEffect(() => {
    writeStorage(STORAGE.view, view)
  }, [view])
  useEffect(() => {
    writeStorage(STORAGE.sweep, sweepConfig)
  }, [sweepConfig])
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
  // 部門別ベストは探している間に何度も更新されるので、最後の更新から少し待ってまとめて書き込む
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const plain = Object.fromEntries(
        Object.entries(bests).map(([key, g]) => [
          key,
          {
            updatedAt: g.updatedAt,
            entries: Object.fromEntries(
              Object.entries(g.entries).map(([metric, e]) => [
                metric,
                e && { ...e, settings: serializeSettings(e.settings) },
              ]),
            ),
          },
        ]),
      )
      writeStorage(STORAGE.bests, plain)
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [bests])

  // ---- 詳しく見る結果 ----
  const groupKey = groupKeyOf(settings)
  const groupBests = bests[groupKey]?.entries ?? {}
  const viewId = viewing ?? 'best:height'
  const viewingMetric = viewId.startsWith('best:')
    ? (viewId.slice(5) as Metric)
    : null
  const sweepIndex = viewId.startsWith('sweep:')
    ? Number(viewId.slice(6))
    : null
  const savedShown = saved.find((x) => x.id === viewId)
  const current:
    | {
        key: string
        label: string
        run: number
        settings: Settings
        result: PackResult
      }
    | undefined = (() => {
    if (viewingMetric) {
      const e = groupBests[viewingMetric]
      return e
        ? {
            key: `b${viewingMetric}${e.foundAt}`,
            label: `部門別ベスト：${metricLabels[viewingMetric]}`,
            run: e.run,
            settings: e.settings,
            result: e.result,
          }
        : undefined
    }
    if (sweepIndex !== null) {
      const r = search.rows[sweepIndex]
      return r?.lowest
        ? {
            key: `w${searchNo}-${sweepIndex}-${r.lowest.height}`,
            label: `試した組み合わせ ${sweepIndex + 1} のいちばん低い結果`,
            run: searchNo,
            settings: search.combos[sweepIndex],
            result: r.lowest,
          }
        : undefined
    }
    return savedShown
      ? {
          key: `s${savedShown.id}`,
          label: '保存した結果',
          run: savedShown.run,
          settings: savedShown.settings,
          result: savedShown.result,
        }
      : undefined
  })()
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

  /** 結果を「詳しく見る」に出し、そこまでスクロールする */
  const show = (id: string | null) => {
    setViewing(id)
    window.setTimeout(
      () =>
        detailsRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        }),
      50,
    )
  }

  /** 結果を「保存した結果」に足す（いっぱいなら古いものから消す） */
  const saveResult = (c: {
    run: number
    settings: Settings
    result: PackResult
  }) => {
    const entry: Saved = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      savedAt: Date.now(),
      run: c.run,
      settings: c.settings,
      result: c.result,
    }
    setSaved((list) => [...list, entry].slice(-MAX_SAVED))
    toast.success('保存しました（いちばん下の「保存した結果」で比べられます）')
  }

  /** 結果の設定を設定欄に戻す（箱の行は作り直して、今の行と番号が重ならないようにする） */
  const applySettings = (from: Settings) =>
    setSettings({
      ...from,
      boxes: from.boxes.map(({ id: _id, enabled, ...box }) =>
        row(box, enabled),
      ),
    })

  const restoreFrom = (from: { settings: Settings } | undefined) => {
    if (!from) return
    if (
      !window.confirm(
        '設定欄を、この結果の設定に置き換えます。よろしいですか？',
      )
    )
      return
    applySettings(from.settings)
    setViewing(null)
    toast.success('設定を戻しました')
  }

  /** その結果の設定に戻し、その結果の積む順番を出発点にして、もう一度探す */
  const continueFrom = (
    from: { settings: Settings; result: PackResult } | undefined,
  ) => {
    if (!from || search.running) return
    applySettings(from.settings)
    startSearch(from)
    toast.success('この結果から続けて詰めます')
  }

  const resetAll = () => {
    if (
      !window.confirm(
        '床・箱のリスト・条件（範囲）・ランダム生成・表示の設定を、すべて初期値に戻します。保存した結果と部門別ベストは消しません。よろしいですか？',
      )
    ) {
      return
    }
    setSettings(freshInitial())
    setSweepConfig(defaultSweep)
    setView(defaultView)
    setViewing(null)
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
      {/* 1. 床と壁 */}
      <section className="space-y-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">1. 床と壁</h2>
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
              床・箱のリスト・条件（範囲）・ランダム生成・3D
              の表示の設定を、すべて初期値に戻します。保存した結果と部門別ベストは消しません。設定はブラウザに保存しているので、ページを読み込み直しても残ります。
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
        </div>
      </section>

      {/* 箱のリスト */}
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">2. 箱（全部で {total} 個）</h2>
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
        <details className="rounded-md bg-muted/40 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            テスト用のランダムな箱を作る
          </summary>
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => generate('replace')}
              >
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
        </details>
      </section>

      {/* 3. 条件 */}
      <section className="space-y-4 rounded-lg border p-4">
        <h2 className="flex items-center gap-1 font-semibold">
          3. 条件
          <HelpTip>
            ぴったり 1
            つに決めなくても、だいたいの範囲を渡せば、その中の組み合わせを「探す」でまとめて試します。決めたい項目だけ「1
            つの値」にしてください。
          </HelpTip>
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <RangeOrValue
            label="箱どうしのすき間"
            help="横に並べる箱の間にあけるすき間です。段ボールはぴったりくっつけられないので、その分の余裕を取ります。上下に重ねる箱の間にはあけません。「範囲で試す」にすると、最小〜最大を刻みごとに試します。"
            value={settings.gap}
            min={0}
            max={50}
            step={1}
            unit=" mm"
            range={sweepConfig.gap}
            onValue={(v) => set('gap', v)}
            onRange={(r) => setRange('gap', r)}
          />
          <RangeOrValue
            label="箱と床の端・壁とのすき間"
            help="床の端や壁と、箱の間にあけるすき間です。「範囲で試す」にすると、最小〜最大を刻みごとに試します。"
            value={settings.edgeGap}
            min={0}
            max={50}
            step={1}
            unit=" mm"
            range={sweepConfig.edgeGap}
            onValue={(v) => set('edgeGap', v)}
            onRange={(r) => setRange('edgeGap', r)}
          />
          <RangeOrValue
            label="底面を支える割合"
            help="上に載せる箱の底面のうち、下の箱で支えられていないといけない割合です。100% なら、はみ出して載せることはしません。下げるほど詰めやすくなりますが、不安定になります。「範囲で試す」にすると、最小〜最大を刻みごとに試します。"
            value={settings.supportPercent}
            min={50}
            max={100}
            step={5}
            unit="% 以上"
            range={sweepConfig.supportPercent}
            onValue={(v) => set('supportPercent', v)}
            onRange={(r) => setRange('supportPercent', r)}
          />
          <fieldset className="space-y-2">
            <legend className="flex items-center gap-1 text-sm">
              優先すること
              <HelpTip>
                「全体の高さを低く」は、積み上がった高さがいちばん低くなる並べ方を探します。「下の段から隙間なく」は、床に直接置く
                1
                段目をなるべく埋めることを優先します。「両方」にすると、範囲でまとめて試すときに両方を試します。
              </HelpTip>
            </legend>
            <div className="inline-flex rounded-md border p-0.5">
              {(
                [
                  ['height', '全体の高さを低く'],
                  ['floor', '下の段から隙間なく'],
                ] as const satisfies readonly [Objective, string][]
              ).map(([value, label]) => {
                const active =
                  !sweepConfig.bothObjectives && settings.objective === value
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      set('objective', value)
                      setSweepConfig((c) => ({ ...c, bothObjectives: false }))
                    }}
                    className={cn(
                      'rounded px-3 py-1 text-xs text-muted-foreground',
                      active && 'bg-muted text-foreground',
                    )}
                  >
                    {label}
                  </button>
                )
              })}
              <button
                type="button"
                aria-pressed={sweepConfig.bothObjectives}
                onClick={() =>
                  setSweepConfig((c) => ({ ...c, bothObjectives: true }))
                }
                className={cn(
                  'rounded px-3 py-1 text-xs text-muted-foreground',
                  sweepConfig.bothObjectives && 'bg-muted text-foreground',
                )}
              >
                両方
              </button>
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
            <RangeOrValue
              label="重心を壁側に寄せる強さ"
              help="壁があるとき、全体の重心をどれだけ壁側に寄せるかです（0〜100）。強くするほど、箱のかたまりが壁際に集まり、手前に高い山ができにくくなります。壁がないときは、重心を床の中心に近づけます。"
              value={settings.wallBias}
              min={0}
              max={100}
              step={10}
              unit=""
              format={(v) =>
                v === 0 ? 'なし' : v <= 30 ? '弱' : v <= 70 ? '中' : '強'
              }
              range={sweepConfig.wallBias}
              onValue={(v) => set('wallBias', v)}
              onRange={(r) => setRange('wallBias', r)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              壁がないときは、重心を床の中心に近づけます。
            </p>
          </div>
          <div className="space-y-2">
            <span className="flex items-center gap-1 text-sm">
              横倒し
              <HelpTip>
                「全部オンでも試す」にすると、横倒しの許可を「箱のリストの設定のまま」と「全部オン」の両方で試します。
              </HelpTip>
            </span>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sweepConfig.bothLayDown}
                onChange={(e) =>
                  setSweepConfig((c) => ({
                    ...c,
                    bothLayDown: e.target.checked,
                  }))
                }
                className="size-4 accent-primary"
              />
              全部オンでも試す
            </label>
            <HelpTip>
              範囲でまとめて試すときに、横倒しの許可を「今の設定のまま」と「全部オン」の両方で試します。
            </HelpTip>
          </div>
          <div className="space-y-2 sm:col-span-2 lg:col-span-3">
            <div className="max-w-md">
              <RangeOrValue
                label="見た目の整い（人の感覚）"
                help="人が見て整っていると感じる積み方を、どれだけ重視するかです（0〜100）。0 なら気にせず、上げるほど、高さを少し譲ってでも整った積み方を選びます。範囲にすると、重視する度合いを変えながら試します。下の 5 つで、何を整いとみなすかを選べます。"
                value={settings.tidy.weight}
                min={0}
                max={100}
                step={10}
                unit=""
                format={(v) =>
                  v === 0 ? 'なし' : v <= 30 ? '弱' : v <= 70 ? '中' : '強'
                }
                range={sweepConfig.tidyWeight}
                onValue={(v) => set('tidy', { ...settings.tidy, weight: v })}
                onRange={(r) => setRange('tidyWeight', r)}
              />
            </div>
            <div
              className={cn(
                'flex flex-wrap gap-x-5 gap-y-1 text-sm',
                settings.tidy.weight === 0 &&
                  !sweepConfig.tidyWeight.on &&
                  'opacity-50',
              )}
            >
              {(
                [
                  ['group', '同じ箱をまとめる'],
                  ['flat', '上の面を平らに'],
                  ['bigBottom', '大きい箱を下に'],
                  ['upright', '横倒しを減らす'],
                  ['even', 'くぼみ・飛び出しを作らない'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.tidy[key]}
                    onChange={(e) =>
                      set('tidy', { ...settings.tidy, [key]: e.target.checked })
                    }
                    className="size-4 accent-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. 探す */}
      <SearchBar
        plan={plan}
        running={search.running}
        elapsedMs={elapsedMs}
        avgVisits={avgVisits}
        activeCount={activeCount}
        count={search.combos.length}
        tried={progress.tried}
        workers={workerCount}
        gpu={gpu}
        useGpu={useGpu}
        onUseGpu={setUseGpu}
        error={error}
        onStart={() => startSearch()}
        onStop={stopSearch}
      />

      {/* 5. 部門別ベスト（3D の横並びと表） */}
      <BestResults
        bests={metrics.flatMap((metric) => {
          const e = groupBests[metric]
          return e
            ? [
                {
                  metric,
                  label: e.sweep ? `#${e.run}-${e.sweep}` : `#${e.run}`,
                  foundAt: e.foundAt,
                  summary: summarize(e.settings),
                  result: e.result,
                },
              ]
            : []
        })}
        current={currentSummary}
        viewing={viewingMetric}
        onView={(metric) => show(metric ? `best:${metric}` : null)}
        onRestore={(metric) => restoreFrom(groupBests[metric])}
        onContinue={(metric) => continueFrom(groupBests[metric])}
        onSave={(metric) => {
          const e = groupBests[metric]
          if (e) saveResult(e)
        }}
        onClear={() => {
          setBests((all) => {
            const next = { ...all }
            delete next[groupKey]
            return next
          })
          if (viewingMetric) setViewing(null)
        }}
      >
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showBest3D}
              onChange={(e) => setShowBest3D(e.target.checked)}
              className="size-4 accent-primary"
            />
            3D で並べて見る
          </label>
          {showBest3D && (
            <BestViews3D
              entries={metrics.map((metric) => ({
                metric,
                entry: groupBests[metric],
              }))}
              view={view}
            />
          )}
        </div>
      </BestResults>

      {search.rows.length > 0 && (
        <SweepTable
          rows={search.rows}
          viewing={sweepIndex}
          onView={(i) => show(`sweep:${i}`)}
        />
      )}

      {/* 6. 詳しく見る */}
      <section
        ref={detailsRef}
        className="scroll-mt-20 space-y-4 rounded-lg border p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">
            6. 詳しく見る
            {current && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {current.label}
              </span>
            )}
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!current || search.running}
              title="この結果の設定に戻し、この結果の積む順番を出発点にして、もう一度探します"
              onClick={() => continueFrom(current)}
            >
              <Play />
              続けて詰める
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!current}
              onClick={() => restoreFrom(current)}
            >
              <RotateCcw />
              設定に戻す
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!current}
              onClick={() => current && saveResult(current)}
            >
              <Save />
              保存
            </Button>
          </div>
        </div>
        {!current && (
          <p className="text-sm text-muted-foreground">
            「探す」を押すと、ここにいちばん低い結果を表示します。部門別ベストや試した組み合わせの「表示」でも切り替えられます。
          </p>
        )}
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

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
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
            label="見た目の整い"
            value={result ? percent(result.tidiness) : '—'}
            unit="%"
            hint="まとまり・平ら・大きい箱が下・横倒しの少なさ"
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
      </section>

      <SavedResults
        saved={savedViews}
        current={currentSummary}
        viewing={savedShown ? savedShown.id : null}
        onView={(id) => show(id)}
        onRestore={(id) => restoreFrom(saved.find((x) => x.id === id))}
        onDelete={(id) => {
          setSaved((list) => list.filter((x) => x.id !== id))
          if (viewing === id) setViewing(null)
        }}
        onClear={() => {
          setSaved([])
          if (savedShown) setViewing(null)
        }}
      />
    </div>
  )
}
