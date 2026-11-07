/// <reference types="@webgpu/types" />
// GPU 係の Worker。ページを開いているあいだ 1 つだけ動かし続け、「この組み合わせを、この時間だけ」と頼まれたら、
// 今の良い並べ順を少しずつ入れ替えた並べ順を数千通り作って GPU でまとめて評価し、
// 上位の数通りだけを CPU で正式に評価して、良ければ次の出発点にする（を繰り返す）
import type { WorkerMessage } from './box-packing.worker'
import {
  createGpuContext,
  createGpuEvaluator,
  type GpuContext,
  type GpuEvaluator,
} from './box-packing-gpu'
import {
  betterFor,
  evaluateOrder,
  type Metric,
  metrics,
  type PackInput,
  type PackResult,
  random,
} from './box-packing-solver'

/** 画面から GPU 係への頼みごと */
export type GpuRequest =
  | { type: 'probe' }
  | { type: 'run'; token: number; input: PackInput; durationMs: number }
  | { type: 'stop'; token: number }

/** GPU 係からの知らせ（token で、どの頼みごとへの返事かを見分ける） */
export type GpuReply =
  | { token: number; kind: 'ready'; description: string }
  | { token: number; kind: 'unavailable' }
  | ({ token: number } & WorkerMessage)

/** この時間、良い結果が出なければ、頼まれた時間の途中でも終える */
const STALL_MS = 90_000
/** 1 回にまとめて評価する並べ順の数の範囲と、1 回にかける時間の目安 */
// GPU は 1 本 1 本の計算が長いので、まとめる数が少ないと GPU が遊んでしまう。多めにまとめ、1 回を長めにする
// （計算は短く分けて GPU に渡すので、1 回が長くても GPU のリセットは起きない）
const MIN_BATCH = 16384
const MAX_BATCH = 65536
const TARGET_BATCH_MS = 3000

// tsconfig は DOM の型なので、Worker の self として使う分だけ型を付ける
const worker = self as unknown as {
  onmessage: (event: MessageEvent<GpuRequest>) => void
  postMessage: (message: GpuReply) => void
}

let ctx: GpuContext | null | undefined
let ctxPromise: Promise<GpuContext | null> | null = null
/** 今動いている頼みごとの番号（止められたら -1） */
let current = -1
/** 組み合わせごとの GPU の部品（作り直しを減らす。増えすぎたら捨てる） */
const evaluators = new Map<string, GpuEvaluator>()

const getContext = async () => {
  if (ctx !== undefined) return ctx
  ctxPromise ??= createGpuContext().catch(() => null)
  ctx = await ctxPromise
  return ctx
}

worker.onmessage = async (event) => {
  const req = event.data
  if (req.type === 'probe') {
    const c = await getContext()
    worker.postMessage(
      c
        ? { token: 0, kind: 'ready', description: c.description }
        : { token: 0, kind: 'unavailable' },
    )
  } else if (req.type === 'stop') {
    if (req.token === current) current = -1
  } else {
    current = req.token
    await run(req.token, req.input, req.durationMs)
  }
}

async function run(token: number, input: PackInput, durationMs: number) {
  const started = Date.now()
  const post = (m: WorkerMessage) => worker.postMessage({ token, ...m })
  const c = await getContext()
  if (!c) {
    worker.postMessage({ token, kind: 'unavailable' })
    post({ kind: 'done', tried: 0, elapsed: 0 })
    return
  }
  const key = JSON.stringify({ ...input, seed: 0, startOrder: undefined })
  let ev = evaluators.get(key)
  if (!ev) {
    if (evaluators.size >= 8) {
      for (const e of evaluators.values()) e.destroy()
      evaluators.clear()
    }
    ev = createGpuEvaluator(c, input)
    evaluators.set(key, ev)
  }
  const { m, types } = ev
  if (m === 0) {
    post({ kind: 'done', tried: 0, elapsed: 0 })
    return
  }

  /** 種類の列 → 箱の番号の列（同じ種類の箱は、番号の小さい順に割り当てる） */
  const toIndices = (typeOrder: number[]) => {
    const pools = new Map<number, number[]>()
    types.forEach((t, i) => {
      const pool = pools.get(t)
      if (pool) pool.push(i)
      else pools.set(t, [i])
    })
    const out: number[] = []
    for (const t of typeOrder) {
      const i = pools.get(t)?.shift()
      if (i !== undefined) out.push(i)
    }
    for (const pool of pools.values()) out.push(...pool)
    return out
  }
  const toTypes = (order: ArrayLike<number>) =>
    Array.from(order, (i) => types[i])

  // 出発点: 頼まれた並べ順か、「底面が大きい順・高い順」
  const box = (t: number) => input.boxes[t]
  const firstTypes =
    input.startOrder ??
    [...types].sort(
      (a, b) =>
        box(b).x * box(b).y - box(a).x * box(a).y ||
        box(b).z - box(a).z ||
        a - b,
    )
  let bestOrder = toIndices(firstTypes)
  let best = evaluateOrder(input, toTypes(bestOrder))
  const metricBest = new Map<Metric, PackResult>()
  let tried = 1
  let lastImproved = Date.now()
  let lastPosted = 0
  let lastStats = 0
  let pending = true
  const pendingMetrics = new Set<Metric>()
  const consider = (r: PackResult) => {
    for (const metric of metrics) {
      if (betterFor(metric, r, metricBest.get(metric))) {
        metricBest.set(metric, r)
        pendingMetrics.add(metric)
        lastImproved = Date.now()
      }
    }
  }
  consider(best)
  const flush = () => {
    const elapsed = Date.now() - started
    if (pending) post({ kind: 'best', result: best, tried, elapsed })
    for (const metric of pendingMetrics) {
      const r = metricBest.get(metric)
      if (r) post({ kind: 'metric', metric, result: r, tried, elapsed })
    }
    pending = false
    pendingMetrics.clear()
    lastPosted = Date.now()
  }

  const rand = random(input.seed)
  const limit = Math.min(MAX_BATCH, ev.maxBatch)
  let batch = Math.min(16384, limit)
  let checked = false
  while (token === current && Date.now() - started < durationMs) {
    if (Date.now() - lastImproved > STALL_MS) break
    // 今の良い並べ順を少しずつ入れ替えた並べ順を batch 通り作る（1 通り目は今の良い並べ順そのもの）
    const orders = new Uint32Array(batch * m)
    for (let r = 0; r < batch; r++) {
      const o = orders.subarray(r * m, (r + 1) * m)
      o.set(bestOrder)
      if (r === 0) continue
      const swaps = 1 + Math.floor(rand() * 3)
      for (let s = 0; s < swaps; s++) {
        const i = Math.floor(rand() * m)
        // 近くの箱と入れ替えることが多いほうが、良い並びを壊しにくい
        const reach = rand() < 0.7 ? 4 : m
        const j = Math.min(
          m - 1,
          Math.max(0, i + Math.floor((rand() * 2 - 1) * reach)),
        )
        const t = o[i]
        o[i] = o[j]
        o[j] = t
      }
    }
    const t0 = performance.now()
    let res: Awaited<ReturnType<GpuEvaluator['evaluate']>>
    try {
      res = await ev.evaluate(orders, batch)
    } catch (e) {
      console.error('GPU の計算に失敗しました', e)
      break
    }
    const ms = performance.now() - t0
    if (token !== current) break
    tried += batch

    // 上位の並べ順を選ぶ（全部置けたものから。なければ全部から）
    const all = Array.from({ length: batch }, (_, i) => i)
    const complete = all.filter((i) => res.placed[i] === m)
    const pool = complete.length > 0 ? complete : all
    const primary =
      input.objective === 'height'
        ? (a: number, b: number) =>
            res.placed[b] - res.placed[a] ||
            res.height[a] - res.height[b] ||
            res.floorArea[b] - res.floorArea[a] ||
            res.cogZ[a] - res.cogZ[b]
        : (a: number, b: number) =>
            res.placed[b] - res.placed[a] ||
            res.floorArea[b] - res.floorArea[a] ||
            res.height[a] - res.height[b] ||
            res.cogZ[a] - res.cogZ[b]
    const picks = new Set<number>([
      ...[...pool].sort(primary).slice(0, 4),
      ...[...pool]
        .sort(
          (a, b) =>
            res.floorArea[b] - res.floorArea[a] ||
            res.height[a] - res.height[b],
        )
        .slice(0, 3),
      ...[...pool]
        .sort(
          (a, b) => res.cogZ[a] - res.cogZ[b] || res.height[a] - res.height[b],
        )
        .slice(0, 3),
    ])
    // 上位だけを CPU で正式に評価する（重心の前後左右や「ぽつんと高い塔」も含めた点数）
    for (const r of picks) {
      const order = orders.subarray(r * m, (r + 1) * m)
      const result = evaluateOrder(input, toTypes(order))
      // 最初の 1 回だけ、GPU と CPU の置き方が同じかを確かめる（違えば計算の食い違い）
      if (
        !checked &&
        (result.height !== res.height[r] ||
          result.placements.length !== res.placed[r])
      ) {
        console.warn('GPU と CPU の結果が違います', {
          gpu: [res.height[r], res.placed[r]],
          cpu: [result.height, result.placements.length],
        })
      }
      consider(result)
      if (result.score < best.score - 1e-9) {
        best = result
        bestOrder = Array.from(order)
        pending = true
        lastImproved = Date.now()
      }
    }
    checked = true
    if ((pending || pendingMetrics.size > 0) && Date.now() - lastPosted > 150)
      flush()
    if (Date.now() - lastStats > 500) {
      post({ kind: 'stats', tried, elapsed: Date.now() - started })
      lastStats = Date.now()
    }
    // 1 回の時間が目安に近づくよう、まとめる数を調整する
    batch = Math.max(
      Math.min(MIN_BATCH, limit),
      Math.min(
        limit,
        Math.round((batch * TARGET_BATCH_MS) / Math.max(1, ms) / 64) * 64,
      ),
    )
  }
  flush()
  post({ kind: 'done', tried, elapsed: Date.now() - started })
}
