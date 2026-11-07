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
  traceOrder,
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
/** 覚えておく良い並べ順の数 */
const ELITES = 12
/** 何回続けて良くならなければ、大きく崩して別の場所を探すか */
const STAGNATION = 4
/** 大きく崩した出発点の近くを、何回探すか */
const KICK_BATCHES = 6

// tsconfig は DOM の型なので、Worker の self として使う分だけ型を付ける
const worker = self as unknown as {
  onmessage: (event: MessageEvent<GpuRequest>) => void
  postMessage: (message: GpuReply) => void
}

let ctx: GpuContext | null | undefined
let ctxPromise: Promise<GpuContext | null> | null = null
/** 今動いている頼みごとの番号（止められたら -1） */
let current = -1

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
    // 前の頼みごとが GPU で計算中の 1 回分を終えるまで待ってから始める
    // （同じ組み合わせだと作業用の場所を共有するので、同時に動かすと結果が壊れる）
    current = req.token
    const token = req.token
    queue = queue.then(() =>
      token === current ? run(token, req.input, req.durationMs) : skip(token),
    )
    await queue
  }
}

/** 頼みごとを順に 1 つずつ動かすための鎖 */
let queue: Promise<void> = Promise.resolve()

/** 始める前に別の頼みごとに替わったときは、すぐ終わったことにする */
async function skip(token: number) {
  worker.postMessage({ token, kind: 'done', tried: 0, elapsed: 0 })
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
  // GPU の作業用の場所は頼みごとごとに作り、終わったら捨てる
  // （前の頼みごとのものを使い回すと、結果が食い違うことがあった）
  const ev = createGpuEvaluator(c, input)
  try {
    await search(token, input, durationMs, ev, started, post)
  } finally {
    ev.destroy()
  }
}

async function search(
  token: number,
  input: PackInput,
  durationMs: number,
  ev: GpuEvaluator,
  started: number,
  post: (m: WorkerMessage) => void,
) {
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

  // ---- 探し方 ----
  // 1. 良い並べ順を上位 ELITES 通り覚えておき、出発点を「いちばん良いもの」だけでなく、ほかの良いものからも選ぶ
  // 2. 崩し方を混ぜる: 2 個の入れ替え・1 個を抜いて別の位置へ・区間を逆順に・2 つの良い並べ順の組み合わせ
  // 3. しばらく良くならないときは、いちばん良い並べ順の一部を大きく混ぜた並べ順を出発点にして、別の場所を探す

  /** 良い並べ順の控え（点数の良い順。種類の列が同じものは 1 つだけ） */
  type Elite = {
    order: Uint32Array
    types: Int32Array
    score: number
    key: string
  }
  const elites: Elite[] = []
  const addElite = (order: ArrayLike<number>, score: number) => {
    const t = Int32Array.from(order, (i) => types[i])
    const key = t.join(',')
    if (elites.some((e) => e.key === key)) return
    if (elites.length >= ELITES && score >= elites[elites.length - 1].score)
      return
    elites.push({ order: Uint32Array.from(order), types: t, score, key })
    elites.sort((a, b) => a.score - b.score)
    if (elites.length > ELITES) elites.pop()
  }
  addElite(bestOrder, best.score)

  // 種類ごとの箱の番号（種類の列から並べ順を作り直すときに使う）
  const typeCount = Math.max(...types) + 1
  const indicesOfType: number[][] = Array.from({ length: typeCount }, () => [])
  types.forEach((t, i) => {
    indicesOfType[t].push(i)
  })

  /** 大きく崩した出発点から探しているあいだの状態（その近くで見つけたいちばん良い並べ順と、残りの回数） */
  let kick: { order: Uint32Array; score: number; left: number } | null = null
  /** いちばん良い結果が、何回続けて良くならなかったか */
  let sinceImproved = 0
  const shake = (base: ArrayLike<number>) => {
    const o = Uint32Array.from(base)
    const len = Math.max(3, Math.floor(m / 5))
    const i = Math.floor(rand() * Math.max(1, m - len + 1))
    for (let a = Math.min(m, i + len) - 1; a > i; a--) {
      const b = i + Math.floor(rand() * (a - i + 1))
      const t = o[a]
      o[a] = o[b]
      o[b] = t
    }
    return o
  }

  /** 今回の出発点を選ぶ */
  const pickParent = () => {
    if (kick) return { parent: kick.order, fromKick: true }
    if (elites.length < 2 || rand() < 0.6) {
      return { parent: Uint32Array.from(bestOrder), fromKick: false }
    }
    // 良いものほど選ばれやすく
    return {
      parent: elites[Math.floor(rand() ** 2 * elites.length)].order,
      fromKick: false,
    }
  }

  /**
   * 出発点を崩した並べ順を count 通り作る。
   * それぞれ「出発点と初めて違う位置」を求め、その位置の順に並べる（GPU の 32 本ずつの足並みがそろう）。
   * 崩しても種類の列が変わらないものは、崩し方を選び直す
   */
  const generate = (count: number) => {
    const { parent, fromKick } = pickParent()
    const parentTypes = Int32Array.from(parent, (i) => types[i])
    const trace = traceOrder(input, Array.from(parentTypes))
    const temp = new Uint32Array(count * m)
    const startOf = new Int32Array(count)
    const used = new Int32Array(typeCount)
    const taken = new Int32Array(typeCount)
    for (let r = 0; r < count; r++) {
      const o = temp.subarray(r * m, (r + 1) * m)
      let start = m
      for (let attempt = 0; attempt < 4 && start === m; attempt++) {
        o.set(parent)
        let lowest = m
        const kind = rand()
        if (kind < 0.5) {
          // 2 個の入れ替え（1〜3 回。近くの箱と入れ替えることが多いほうが、良い並びを壊しにくい）
          const swaps = 1 + Math.floor(rand() * 3)
          for (let sw = 0; sw < swaps; sw++) {
            const i = Math.floor(rand() * m)
            const reach = rand() < 0.7 ? 4 : m
            const j = Math.min(
              m - 1,
              Math.max(0, i + Math.floor((rand() * 2 - 1) * reach)),
            )
            const t = o[i]
            o[i] = o[j]
            o[j] = t
            lowest = Math.min(lowest, i, j)
          }
        } else if (kind < 0.7) {
          // 1 個を抜いて、別の位置に入れる
          const i = Math.floor(rand() * m)
          const reach = rand() < 0.7 ? 6 : m
          const j = Math.min(
            m - 1,
            Math.max(0, i + Math.floor((rand() * 2 - 1) * reach)),
          )
          const v = o[i]
          if (i < j) o.copyWithin(i, i + 1, j + 1)
          else if (i > j) o.copyWithin(j + 1, j, i)
          o[j] = v
          lowest = Math.min(i, j)
        } else if (kind < 0.8 || elites.length < 2) {
          // 一続きの区間を逆順にする
          const len =
            2 + Math.floor(rand() * Math.max(1, Math.floor(m / 4) - 1))
          const i = Math.floor(rand() * Math.max(1, m - len + 1))
          o.subarray(i, Math.min(m, i + len)).reverse()
          lowest = i
        } else {
          // 2 つの良い並べ順の組み合わせ: 出発点の前半はそのまま、残りはもう片方の順番に並べる
          const other = elites[Math.floor(rand() * elites.length)]
          const c = 1 + Math.floor(rand() * (m - 1))
          used.fill(0)
          taken.fill(0)
          for (let q = 0; q < c; q++) used[parentTypes[q]]++
          for (let q = 0; q < c; q++) {
            const t = parentTypes[q]
            o[q] = indicesOfType[t][taken[t]++]
          }
          let w = c
          for (let q = 0; q < m && w < m; q++) {
            const t = other.types[q]
            if (used[t] > 0) {
              used[t]--
              continue
            }
            o[w++] = indicesOfType[t][taken[t]++]
          }
          lowest = c
        }
        start = lowest
        while (start < m && types[o[start]] === parentTypes[start]) start++
      }
      startOf[r] = start
    }
    // 違う位置ごとに数えて、その順の並び位置を決める（数え上げの並べ替え）
    const offset = new Int32Array(m + 2)
    for (let r = 0; r < count; r++) offset[startOf[r] + 1]++
    for (let i = 1; i <= m + 1; i++) offset[i] += offset[i - 1]
    const orders = new Uint32Array(count * m)
    const starts = new Int32Array(count)
    for (let r = 0; r < count; r++) {
      const pos = offset[startOf[r]]++
      orders.set(temp.subarray(r * m, (r + 1) * m), pos * m)
      starts[pos] = startOf[r]
    }
    return { orders, starts, trace, count, fromKick }
  }

  type Batch = ReturnType<typeof generate>
  /** GPU の結果の上位を、CPU で正式に評価する */
  const review = (
    job: Batch,
    res: Awaited<ReturnType<GpuEvaluator['evaluate']>>,
  ) => {
    const k = job.count
    const all = Array.from({ length: k }, (_, i) => i).filter(
      (i) => job.starts[i] < m,
    )
    const complete = all.filter((i) => res.placed[i] === m)
    const pool = complete.length > 0 ? complete : all
    const primary =
      input.objective === 'height'
        ? (x: number, y: number) =>
            res.placed[y] - res.placed[x] ||
            res.height[x] - res.height[y] ||
            res.floorArea[y] - res.floorArea[x] ||
            res.cogZ[x] - res.cogZ[y]
        : (x: number, y: number) =>
            res.placed[y] - res.placed[x] ||
            res.floorArea[y] - res.floorArea[x] ||
            res.height[x] - res.height[y] ||
            res.cogZ[x] - res.cogZ[y]
    const picks = new Set<number>([
      ...[...pool].sort(primary).slice(0, 4),
      ...[...pool]
        .sort(
          (x, y) =>
            res.floorArea[y] - res.floorArea[x] ||
            res.height[x] - res.height[y],
        )
        .slice(0, 3),
      ...[...pool]
        .sort(
          (x, y) => res.cogZ[x] - res.cogZ[y] || res.height[x] - res.height[y],
        )
        .slice(0, 3),
    ])
    // 見た目の整いは GPU では測りきれないので、横倒しが少ないもの（重視するとき）と、ランダムな数通りも混ぜる
    if (input.tidy.weight > 0) {
      if (input.tidy.upright) {
        for (const r of [...pool]
          .sort(
            (x, y) =>
              res.laid[x] - res.laid[y] || res.height[x] - res.height[y],
          )
          .slice(0, 3))
          picks.add(r)
      }
      for (let i = 0; i < 3 && pool.length > 0; i++) {
        picks.add(pool[Math.floor(rand() * pool.length)])
      }
    }
    let improved = false
    for (const r of picks) {
      const order = job.orders.subarray(r * m, (r + 1) * m)
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
          start: job.starts[r],
        })
      }
      addElite(order, result.score)
      // 大きく崩した出発点から探しているあいだは、その近くでいちばん良いものを次の出発点にする
      if (job.fromKick && kick && result.score < kick.score) {
        kick = { ...kick, order: Uint32Array.from(order), score: result.score }
      }
      consider(result)
      if (result.score < best.score - 1e-9) {
        best = result
        bestOrder = Array.from(order)
        pending = true
        improved = true
        lastImproved = Date.now()
      }
    }
    checked = true
    if (improved) {
      sinceImproved = 0
      kick = null
    } else {
      sinceImproved++
      if (kick && job.fromKick) {
        kick.left--
        if (kick.left <= 0) kick = null
      }
      // しばらく良くならなければ、いちばん良い並べ順の一部を大きく混ぜて、別の場所を探す
      if (!kick && sinceImproved >= STAGNATION) {
        kick = {
          order: shake(bestOrder),
          score: Number.POSITIVE_INFINITY,
          left: KICK_BATCHES,
        }
        sinceImproved = 0
      }
    }
  }

  // GPU が計算している間に、CPU で前の回の上位を正式に評価し、次の次の回の並べ順を作っておく
  // （GPU は、前の回が終わったらすぐ次の回に取りかかれる）
  let job = generate(batch)
  let inFlight: Promise<Awaited<ReturnType<GpuEvaluator['evaluate']>>> | null =
    ev.evaluate(job.orders, job.starts, job.trace, job.count)
  let t0 = performance.now()
  let next = generate(batch)
  while (inFlight && token === current) {
    let res: Awaited<ReturnType<GpuEvaluator['evaluate']>>
    try {
      res = await inFlight
    } catch (e) {
      console.error('GPU の計算に失敗しました', e)
      break
    }
    const ms = performance.now() - t0
    const done = job
    tried += done.count
    const keepGoing =
      token === current &&
      Date.now() - started < durationMs &&
      Date.now() - lastImproved <= STALL_MS
    inFlight = null
    if (keepGoing) {
      job = next
      t0 = performance.now()
      inFlight = ev.evaluate(job.orders, job.starts, job.trace, job.count)
    }
    review(done, res)
    // 1 回の時間が目安に近づくよう、まとめる数を調整する
    batch = Math.max(
      Math.min(MIN_BATCH, limit),
      Math.min(
        limit,
        Math.round((done.count * TARGET_BATCH_MS) / Math.max(1, ms) / 64) * 64,
      ),
    )
    if (keepGoing) next = generate(batch)
    if ((pending || pendingMetrics.size > 0) && Date.now() - lastPosted > 150)
      flush()
    if (Date.now() - lastStats > 500) {
      post({ kind: 'stats', tried, elapsed: Date.now() - started })
      lastStats = Date.now()
    }
  }
  if (inFlight) await inFlight.catch(() => undefined)
  flush()
  post({ kind: 'done', tried, elapsed: Date.now() - started })
}
