/// <reference types="@webgpu/types" />
// GPU 係の Worker。ページを開いているあいだ 1 つだけ動かし続け、「この組み合わせを、この時間だけ」と頼まれたら、
// 今の良い並べ順を少しずつ入れ替えた並べ順を数千通り作って GPU でまとめて評価し、
// 上位の数通りだけを CPU で正式に評価して、良ければ次の出発点にする（を繰り返す）
import type { WorkerMessage } from './box-packing.worker'
import type { EvalReply, EvalRequest } from './box-packing-eval.worker'
import {
  createGpuContext,
  createGpuEvaluator,
  type GpuContext,
  type GpuEvaluator,
  type GpuMetrics,
  NONE,
} from './box-packing-gpu'
import {
  acceptWorse,
  betterFor,
  createKindStats,
  evaluateIds,
  type Genome,
  type Metric,
  MUTATION_KINDS,
  metrics,
  mutate,
  type PackInput,
  type PackResult,
  RULE_MAX,
  RULE_SIZE,
  type Rule,
  random,
  rulesFrozen,
  shakePlan,
  startPlans,
  temperatureAt,
  traceIds,
  type UnitTable,
  unitIdsOf,
  unitsOf,
  weightOf,
  withRulePhase,
} from './box-packing-solver'

/** 画面から GPU 係への頼みごと */
export type GpuRequest =
  | { type: 'probe' }
  | { type: 'run'; token: number; input: PackInput; durationMs: number }
  | { type: 'stop'; token: number }
  /** ほかの係が見つけた良い並べ方（今より良ければ乗り換える） */
  | { type: 'adopt'; token: number; genome: Genome }

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
/** GPU の見積もりの上位から、正式に評価する数（手伝いの係がいれば多く） */
const REVIEW_TOP_WITH_HELPERS = 96
const REVIEW_TOP_ALONE = 16
/** GPU 係の焼きなましの温度が半分になるまでの回数（1 回は数万通り） */
const GPU_HALF_LIFE = 30
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
let currentToken = -1

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
    if (req.token === currentToken) currentToken = -1
  } else if (req.type === 'adopt') {
    if (req.token === currentToken) adopted = req.genome
  } else {
    // 前の頼みごとが GPU で計算中の 1 回分を終えるまで待ってから始める
    // （同じ組み合わせだと作業用の場所を共有するので、同時に動かすと結果が壊れる）
    currentToken = req.token
    const token = req.token
    queue = queue.then(() =>
      token === currentToken
        ? run(token, req.input, req.durationMs)
        : skip(token),
    )
    await queue
  }
}

/** ほかの係から受け取った並べ方（次の区切りで調べる） */
let adopted: Genome | null = null

// ---- 手伝いの係（GPU の上位の並べ方を、CPU の空いているコアで正式に評価する） ----

/** 手伝いの係の数（画面の計算係と画面の分を除いた、空いているコアから最大 4 つ） */
const HELPERS = Math.max(
  0,
  Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2) - 9),
)
let helpers: { worker: Worker; run: number }[] | null = null
let helperId = 0
const helperWaits = new Map<number, (results: PackResult[]) => void>()
const getHelpers = () => {
  if (helpers) return helpers
  helpers = []
  for (let i = 0; i < HELPERS; i++) {
    try {
      const w = new Worker(
        new URL('./box-packing-eval.worker.ts', import.meta.url),
        {
          type: 'module',
        },
      )
      w.onmessage = (e: MessageEvent<EvalReply>) => {
        helperWaits.get(e.data.id)?.(e.data.results)
        helperWaits.delete(e.data.id)
      }
      helpers.push({ worker: w, run: -1 })
    } catch {
      break
    }
  }
  return helpers
}

/**
 * 並べ方をまとめて正式に評価する。手伝いの係がいれば分けて頼み、いなければ自分で評価する。
 * 返す順は plans と同じ
 */
async function evaluateMany(
  run: number,
  input: PackInput,
  table: UnitTable,
  plans: Plan[],
): Promise<PackResult[]> {
  const pool = getHelpers()
  if (pool.length === 0 || plans.length < 8) {
    return plans.map((p) => evaluateIds(input, table, p.ids, p.rule))
  }
  const per = Math.ceil(plans.length / pool.length)
  const parts = await Promise.all(
    pool.map((h, i) => {
      const chunk = plans.slice(i * per, (i + 1) * per)
      if (chunk.length === 0) return Promise.resolve([] as PackResult[])
      const id = ++helperId
      const req: EvalRequest = {
        id,
        run,
        plans: chunk.map((p) => ({ ids: p.ids, rule: p.rule })),
      }
      if (h.run !== run) {
        req.input = input
        h.run = run
      }
      return new Promise<PackResult[]>((resolve) => {
        helperWaits.set(id, resolve)
        h.worker.postMessage(req)
      })
    }),
  )
  const results = parts.flat()
  // 手伝いの係が答えられなかったとき（頼みごとの切り替わりなど）は、自分で評価する
  return results.length === plans.length
    ? results
    : plans.map((p) => evaluateIds(input, table, p.ids, p.rule))
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
  const table = unitsOf(input)
  // 作業用の場所を 2 組作り、2 回分を交互に GPU に渡す（片方の結果を CPU で調べているあいだも、GPU を休ませない）
  const evs = [
    createGpuEvaluator(c, input, table),
    createGpuEvaluator(c, input, table),
  ]
  try {
    await search(token, input, table, durationMs, evs, started, post)
  } finally {
    for (const ev of evs) ev.destroy()
  }
}

/** 並べ方（置く単位の番号の列とルール） */
type Plan = { ids: number[]; rule: Rule }

async function search(
  token: number,
  input: PackInput,
  table: UnitTable,
  durationMs: number,
  evs: GpuEvaluator[],
  started: number,
  post: (m: WorkerMessage) => void,
) {
  const { m, stride } = evs[0]
  if (table.boxCount === 0) {
    post({ kind: 'done', tried: 0, elapsed: 0 })
    return
  }
  const metricBest = new Map<Metric, PackResult>()
  let lastImproved = Date.now()
  let lastPosted = 0
  let lastStats = 0
  let pending = true
  const pendingMetrics = new Set<Metric>()
  const consider = (r: PackResult) => {
    for (const metric of metrics) {
      if (
        betterFor(
          metric,
          r,
          metricBest.get(metric),
          metricBest.get('height')?.height,
        )
      ) {
        metricBest.set(metric, r)
        pendingMetrics.add(metric)
        lastImproved = Date.now()
      }
    }
  }

  // ---- 探し方 ----
  // 1. 良い並べ方を上位 ELITES 通り覚えておき、出発点を「いちばん良いもの」だけでなく、ほかの良いものからも選ぶ
  // 2. 崩し方を混ぜる（solver の mutate）: 並べ順・ルールの重み・かたまりの分け方とつなぎ方・2 つの組み合わせ
  // 3. しばらく良くならないときは、いちばん良い並べ方の一部を大きく混ぜた並べ方を出発点にして、別の場所を探す

  /** 良い並べ方の控え（点数の良い順。同じものは 1 つだけ） */
  type Elite = Plan & { score: number; key: string }
  const elites: Elite[] = []
  const keyOf = (p: Plan) => `${p.ids.join(',')}|${p.rule.join(',')}`
  /** 良い並べ方の控えに入れる（入ったら true） */
  const addElite = (p: Plan, score: number) => {
    const key = keyOf(p)
    if (elites.some((e) => e.key === key)) return false
    if (elites.length >= ELITES && score >= elites[elites.length - 1].score)
      return false
    elites.push({ ids: [...p.ids], rule: [...p.rule], score, key })
    elites.sort((a, b) => a.score - b.score)
    if (elites.length > ELITES) elites.pop()
    return true
  }

  // 最初の並べ方（頼まれた並べ方・ばらの箱をいろいろな順に・大きなかたまり、ルールもいくつか）を CPU で評価する
  let tried = 0
  let bestPlan: Plan | null = null
  let best: PackResult | null = null
  for (const p of startPlans(input, table)) {
    const r = evaluateIds(input, table, p.ids, p.rule)
    tried++
    consider(r)
    addElite(p, r.score)
    if (!best || r.score < best.score) {
      best = r
      bestPlan = p
    }
  }
  if (!best || !bestPlan) {
    post({ kind: 'done', tried, elapsed: Date.now() - started })
    return
  }
  let current: Plan = bestPlan
  let currentBest: PackResult = best
  const flush = () => {
    const elapsed = Date.now() - started
    if (pending) post({ kind: 'best', result: currentBest, tried, elapsed })
    for (const metric of pendingMetrics) {
      const r = metricBest.get(metric)
      if (r) post({ kind: 'metric', metric, result: r, tried, elapsed })
    }
    pending = false
    pendingMetrics.clear()
    lastPosted = Date.now()
  }

  const rand = random(input.seed)
  const stats = createKindStats()
  adopted = null
  const limit = Math.min(MAX_BATCH, evs[0].maxBatch)
  let batch = Math.min(MIN_BATCH, limit)
  let checked = false

  /** 大きく崩した出発点から探しているあいだの状態（その近くで見つけたいちばん良い並べ方と、残りの回数） */
  let kick: (Plan & { score: number; left: number }) | null = null
  /** いちばん良い結果が、何回続けて良くならなかったか */
  let sinceImproved = 0
  const frozen = () => rulesFrozen(input, Date.now() - started)
  /** 焼きなまし: 今歩いている並べ方（いちばん良いものより少し悪いこともある）と、温度を決める回数 */
  let walk: Plan & { score: number } = { ...bestPlan, score: best.score }
  let annealBatches = 0

  /** 今回の出発点を選ぶ */
  const pickParent = (): { parent: Plan; fromKick: boolean } => {
    if (kick) return { parent: kick, fromKick: true }
    if (elites.length < 2 || rand() < 0.6)
      return { parent: walk, fromKick: false }
    // 良いものほど選ばれやすく
    return {
      parent: elites[Math.floor(rand() ** 2 * elites.length)],
      fromKick: false,
    }
  }

  /**
   * 出発点を崩した並べ方を count 通り作る。
   * それぞれ「出発点と初めて違う位置」を求め、その位置の順に並べる（GPU の 32 本ずつの足並みがそろう）
   */
  const generate = (count: number) => {
    const { parent, fromKick } = pickParent()
    const trace = traceIds(input, table, parent.ids, parent.rule)
    const plans: (Plan & { kind: number })[] = new Array(count)
    const startOf = new Int32Array(count)
    const weights = withRulePhase(stats.weights(), frozen())
    const kindCount = new Array<number>(MUTATION_KINDS).fill(0)
    for (let r = 0; r < count; r++) {
      const other =
        elites.length > 1
          ? elites[Math.floor(rand() * elites.length)].ids
          : undefined
      const next = mutate(parent.ids, parent.rule, rand, table, other, weights)
      plans[r] = { ids: next.ids, rule: next.rule, kind: next.kind }
      if (next.kind >= 0) kindCount[next.kind]++
      startOf[r] = Math.min(next.start, m)
    }
    // 違う位置ごとに数えて、その順の並び位置を決める（数え上げの並べ替え）
    const offset = new Int32Array(m + 2)
    for (let r = 0; r < count; r++) offset[startOf[r] + 1]++
    for (let i = 1; i <= m + 1; i++) offset[i] += offset[i - 1]
    const rows = new Uint32Array(count * stride)
    rows.fill(NONE)
    const starts = new Int32Array(count)
    const sorted: (Plan & { kind: number })[] = new Array(count)
    let length = 0
    for (let r = 0; r < count; r++) {
      const pos = offset[startOf[r]]++
      const p = plans[r]
      rows.set(p.ids, pos * stride)
      for (let i = 0; i < RULE_SIZE; i++)
        rows[pos * stride + m + i] = weightOf(p.rule[i])
      starts[pos] = startOf[r]
      sorted[pos] = p
      if (p.ids.length > length) length = p.ids.length
    }
    return {
      rows,
      starts,
      plans: sorted,
      trace,
      count,
      fromKick,
      length,
      kindCount,
    }
  }

  type Batch = ReturnType<typeof generate>
  /** GPU の見積もりの上位を、CPU で正式に評価する */
  const review = async (job: Batch, res: GpuMetrics) => {
    const k = job.count
    const all = Array.from({ length: k }, (_, i) => i).filter(
      (i) => job.starts[i] < m,
    )
    const complete = all.filter((i) => res.placed[i] === table.boxCount)
    const pool = complete.length > 0 ? complete : all
    const top = (cmp: (x: number, y: number) => number, n: number) =>
      [...pool].sort(cmp).slice(0, n)
    // 正式な点数に近い見積もりで上位を選び、部門ごとの上位と、ランダムな数通りも混ぜる
    const picks = new Set<number>([
      ...top(
        (x, y) => res.score[x] - res.score[y],
        getHelpers().length > 0 ? REVIEW_TOP_WITH_HELPERS : REVIEW_TOP_ALONE,
      ),
      ...top(
        (x, y) => res.height[x] - res.height[y] || res.score[x] - res.score[y],
        3,
      ),
      ...top(
        (x, y) =>
          res.floorArea[y] - res.floorArea[x] || res.height[x] - res.height[y],
        3,
      ),
      ...top((x, y) => res.cogZ[x] - res.cogZ[y], 3),
    ])
    if (input.tidy.weight > 0) {
      for (const r of top(
        (x, y) =>
          res.tidiness[y] - res.tidiness[x] || res.height[x] - res.height[y],
        3,
      ))
        picks.add(r)
    }
    for (let i = 0; i < 2 && pool.length > 0; i++) {
      picks.add(pool[Math.floor(rand() * pool.length)])
    }
    let improved = false
    const pickList = [...picks]
    const results = await evaluateMany(
      token,
      input,
      table,
      pickList.map((r) => job.plans[r]),
    )
    const kindWins = new Array<number>(MUTATION_KINDS).fill(0)
    /** この回でいちばん良かった並べ方（焼きなましで、乗り換えるか決める） */
    let batchBest: (Plan & { score: number }) | null = null
    for (let q = 0; q < pickList.length; q++) {
      const r = pickList[q]
      const plan = job.plans[r]
      const result = results[q]
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
      const entered = addElite(plan, result.score)
      if (entered && plan.kind >= 0) kindWins[plan.kind]++
      // 大きく崩した出発点から探しているあいだは、その近くでいちばん良いものを次の出発点にする
      if (job.fromKick && kick && result.score < kick.score) {
        kick = { ...kick, ids: plan.ids, rule: plan.rule, score: result.score }
      }
      consider(result)
      if (!job.fromKick && (!batchBest || result.score < batchBest.score))
        batchBest = { ids: plan.ids, rule: plan.rule, score: result.score }
      if (result.score < currentBest.score - 1e-9) {
        currentBest = result
        current = plan
        pending = true
        improved = true
        lastImproved = Date.now()
      }
    }
    checked = true
    // 焼きなまし: この回のいちばん良い並べ方が今より良ければ乗り換え、少し悪くても、温度に応じてときどき乗り換える
    annealBatches++
    if (improved) walk = { ...current, score: currentBest.score }
    else if (
      batchBest &&
      acceptWorse(
        batchBest.score - walk.score,
        temperatureAt(annealBatches, GPU_HALF_LIFE),
        rand,
      )
    )
      walk = batchBest
    job.kindCount.forEach((count, kind) => {
      stats.record(kind, count, kindWins[kind])
    })
    if (improved) {
      sinceImproved = 0
      kick = null
    } else {
      sinceImproved++
      if (kick && job.fromKick) {
        kick.left--
        if (kick.left <= 0) kick = null
      }
      // しばらく良くならなければ、いちばん良い並べ方の一部を大きく混ぜて、別の場所を探す
      if (!kick && sinceImproved >= STAGNATION) {
        kick = {
          ...shakePlan(current.ids, current.rule, rand, frozen()),
          score: Number.POSITIVE_INFINITY,
          left: KICK_BATCHES,
        }
        sinceImproved = 0
        annealBatches = 0
      }
    }
  }

  // 2 組の作業用の場所で、2 回分を同時に GPU に渡しておく。片方が終わったら、その結果を CPU で調べ、
  // 同じ組で次の回を渡す（GPU には、いつも次の計算が待っている）
  type Flight = { job: Batch; t0: number; result: Promise<GpuMetrics> }
  const launch = (slot: number): Flight => {
    const job = generate(batch)
    return {
      job,
      t0: performance.now(),
      result: evs[slot].evaluate(
        job.rows,
        job.starts,
        job.trace,
        job.count,
        job.length,
      ),
    }
  }
  const flights: (Flight | null)[] = [launch(0), launch(1)]
  let slot = 0
  while (token === currentToken) {
    const flight = flights[slot]
    if (!flight) break
    let res: GpuMetrics
    try {
      res = await flight.result
    } catch (e) {
      console.error('GPU の計算に失敗しました', e)
      break
    }
    const ms = performance.now() - flight.t0
    tried += flight.job.count
    const keepGoing =
      token === currentToken &&
      Date.now() - started < durationMs &&
      Date.now() - lastImproved <= STALL_MS
    // 次の回を先に GPU に渡してから、この回の上位を調べる（GPU を待たせない）
    flights[slot] = keepGoing ? launch(slot) : null
    await review(flight.job, res)
    // 受け取った並べ方は、ほかの関数（onmessage）で書き換わるので、型の絞り込みを外して読む
    const g = adopted as Genome | null
    if (g) {
      adopted = null
      const plan = {
        ids: unitIdsOf(g.seq, table),
        rule: g.rule.map((e) => Math.max(0, Math.min(RULE_MAX, e))),
      }
      const r = evaluateIds(input, table, plan.ids, plan.rule)
      tried++
      consider(r)
      addElite(plan, r.score)
      if (r.score < currentBest.score - 1e-9) {
        currentBest = r
        current = plan
        walk = { ...plan, score: r.score }
        pending = true
        lastImproved = Date.now()
      }
    }
    // 1 回の時間が目安に近づくよう、まとめる数を調整する（2 回分が同時に動くので、そのぶん長くかかる）
    batch = Math.max(
      Math.min(MIN_BATCH, limit),
      Math.min(
        limit,
        Math.round(
          (flight.job.count * TARGET_BATCH_MS) / Math.max(1, ms) / 64,
        ) * 64,
      ),
    )
    slot = 1 - slot
    if ((pending || pendingMetrics.size > 0) && Date.now() - lastPosted > 150)
      flush()
    if (Date.now() - lastStats > 500) {
      post({ kind: 'stats', tried, elapsed: Date.now() - started })
      lastStats = Date.now()
    }
    if (!keepGoing && !flights[slot]) break
  }
  for (const f of flights) if (f) await f.result.catch(() => undefined)
  flush()
  post({ kind: 'done', tried, elapsed: Date.now() - started })
}
