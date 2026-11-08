// 箱詰めの計算を、画面を止めないよう別スレッドで続ける。
// 画面は係（この Worker）を作ったまま使い回し、受け持つ組み合わせが変わるたびに「run」で頼み直す
// （受け持ちのたびに Worker を作り直すと、立ち上がりに時間を取られる）
import { createColumnSearch } from './columns'
import {
  betterFor,
  createSearch,
  type Genome,
  type Metric,
  metrics,
  type PackInput,
  type PackResult,
} from './solver'

export type WorkerMessage =
  /** より良い結果が見つかった（「優先すること」の点数で） */
  | { kind: 'best'; result: PackResult; tried: number; elapsed: number }
  /** 部門別（低さ・1 段目・重心）のいちばんが更新された */
  | {
      kind: 'metric'
      metric: Metric
      result: PackResult
      tried: number
      elapsed: number
    }
  /** 途中経過（試した数） */
  | { kind: 'stats'; tried: number; elapsed: number }
  /** 良い結果が出なくなったので止めた */
  | { kind: 'done'; tried: number; elapsed: number }

/** この時間、良い結果が出なければ止める */
const STALL_MS = 90_000
/** どんなに良くなり続けても、ここで止める */
const MAX_MS = 15 * 60_000
/** 続けて見つかるときに送る間隔 */
const POST_MS = 150

// tsconfig は DOM の型なので、Worker の self として使う分だけ型を付ける
const worker = self as unknown as {
  onmessage: (event: MessageEvent<SearchRequest>) => void
  postMessage: (message: WorkerMessage & { token: number }) => void
}

/** 画面からの頼みごと: 探す（token で、どの頼みごとへの返事かを見分ける）・止める・並べ方の受け取り */
export type SearchRequest =
  | { kind: 'run'; token: number; input: PackInput }
  | { kind: 'stop'; token: number }
  | AdoptMessage

/** 画面から: ほかの係が見つけた良い並べ方（今より良ければ乗り換える） */
export type AdoptMessage = { kind: 'adopt'; genome: Genome }

/** 今動いている探索（ほかの係の並べ方を受け取るのに使う） */
let current:
  | ReturnType<typeof createSearch>
  | ReturnType<typeof createColumnSearch>
  | null = null
/** 計算を区切る時間。区切りごとにほかの知らせ（並べ方の受け取り）を受け付ける */
const CHUNK_MS = 40

/** 今の頼みごとの番号 */
let currentToken = -1

worker.onmessage = (event) => {
  const data = event.data
  if (data.kind === 'adopt') {
    if (current?.adopt(data.genome)) pendingAdopt = true
  } else if (data.kind === 'stop') {
    // 計算は次の区切りで止まる（止めたあとは何も送らない）
    if (data.token === currentToken) {
      current = null
      currentToken = -1
    }
  } else {
    currentToken = data.token
    void run(data.input, data.token)
  }
}

/** 受け取った並べ方で良くなった（次の区切りで知らせる） */
let pendingAdopt = false

async function run(input: PackInput, token: number) {
  const post = (message: WorkerMessage) => {
    if (token === currentToken) worker.postMessage({ ...message, token })
  }
  // 部門別のいちばん（全部置けた結果だけ）。更新されたら、間引いて送る
  const metricBest = new Map<Metric, PackResult>()
  const metricPending = new Set<Metric>()
  let metricImproved = false
  const onResult = (result: PackResult) => {
    for (const metric of metrics) {
      if (
        betterFor(
          metric,
          result,
          metricBest.get(metric),
          metricBest.get('height')?.height,
        )
      ) {
        metricBest.set(metric, result)
        metricPending.add(metric)
        metricImproved = true
      }
    }
  }
  // 計算方法で、並べ順で探すか、柱で積むかを選ぶ
  const search =
    input.method === 'columns'
      ? createColumnSearch(input, onResult)
      : createSearch(input, onResult)
  current = search
  pendingAdopt = false
  const started = Date.now()
  let lastImproved = started
  let chunkStarted = started
  let lastPosted = 0
  let lastStats = 0
  let pending = true

  const flush = (elapsed: number) => {
    if (pending) {
      post({
        kind: 'best',
        result: search.best,
        tried: search.tried,
        elapsed,
      })
      pending = false
    }
    for (const metric of metricPending) {
      const result = metricBest.get(metric)
      if (result) {
        post({
          kind: 'metric',
          metric,
          result,
          tried: search.tried,
          elapsed,
        })
      }
    }
    metricPending.clear()
  }

  for (;;) {
    let now = Date.now()
    // ときどき区切って、ほかの知らせ（並べ方の受け取り）を受け付ける
    if (now - chunkStarted > CHUNK_MS) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      now = Date.now()
      chunkStarted = now
      if (current !== search) return
      if (pendingAdopt) {
        pendingAdopt = false
        pending = true
        lastImproved = now
      }
    }
    const elapsed = now - started
    // 良い結果は見つかるたびに送る（続けて見つかるときは間引く）
    if ((pending || metricPending.size > 0) && now - lastPosted > POST_MS) {
      flush(elapsed)
      lastPosted = now
    }
    if (now - lastStats > 500) {
      post({ kind: 'stats', tried: search.tried, elapsed })
      lastStats = now
    }
    if (search.exhausted || now - lastImproved > STALL_MS || elapsed > MAX_MS) {
      flush(elapsed)
      post({ kind: 'done', tried: search.tried, elapsed })
      if (current === search) current = null
      return
    }
    metricImproved = false
    const improved = search.step()
    if (improved) pending = true
    // 「優先すること」でも部門別でも、どれかが良くなっていれば、まだ探し続ける
    if (improved || metricImproved) lastImproved = Date.now()
  }
}
