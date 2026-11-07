// 箱詰めの計算を、画面を止めないよう別スレッドで続ける（止めるときは画面側が terminate する）
import {
  betterFor,
  createSearch,
  type Metric,
  metrics,
  type PackInput,
  type PackResult,
} from './box-packing-solver'

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
  onmessage: (event: MessageEvent<PackInput>) => void
  postMessage: (message: WorkerMessage) => void
}

worker.onmessage = (event) => {
  // 部門別のいちばん（全部置けた結果だけ）。更新されたら、間引いて送る
  const metricBest = new Map<Metric, PackResult>()
  const metricPending = new Set<Metric>()
  let metricImproved = false
  const search = createSearch(event.data, (result) => {
    for (const metric of metrics) {
      if (betterFor(metric, result, metricBest.get(metric))) {
        metricBest.set(metric, result)
        metricPending.add(metric)
        metricImproved = true
      }
    }
  })
  const started = Date.now()
  let lastImproved = started
  let lastPosted = 0
  let lastStats = 0
  let pending = true

  const flush = (elapsed: number) => {
    if (pending) {
      worker.postMessage({
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
        worker.postMessage({
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
    const now = Date.now()
    const elapsed = now - started
    // 良い結果は見つかるたびに送る（続けて見つかるときは間引く）
    if ((pending || metricPending.size > 0) && now - lastPosted > POST_MS) {
      flush(elapsed)
      lastPosted = now
    }
    if (now - lastStats > 500) {
      worker.postMessage({ kind: 'stats', tried: search.tried, elapsed })
      lastStats = now
    }
    if (search.exhausted || now - lastImproved > STALL_MS || elapsed > MAX_MS) {
      flush(elapsed)
      worker.postMessage({ kind: 'done', tried: search.tried, elapsed })
      return
    }
    metricImproved = false
    const improved = search.step()
    if (improved) pending = true
    // 「優先すること」でも部門別でも、どれかが良くなっていれば、まだ探し続ける
    if (improved || metricImproved) lastImproved = Date.now()
  }
}
