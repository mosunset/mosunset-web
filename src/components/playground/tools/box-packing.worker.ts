// 箱詰めの計算を、画面を止めないよう別スレッドで続ける（止めるときは画面側が terminate する）
import {
  createSearch,
  type PackInput,
  type PackResult,
} from './box-packing-solver'

export type WorkerMessage =
  /** より良い結果が見つかった */
  | { kind: 'best'; result: PackResult; tried: number; elapsed: number }
  /** 途中経過（試した数） */
  | { kind: 'stats'; tried: number; elapsed: number }
  /** 良い結果が出なくなったので止めた */
  | { kind: 'done'; tried: number; elapsed: number }

/** この時間、良い結果が出なければ止める */
const STALL_MS = 30_000
/** どんなに良くなり続けても、ここで止める */
const MAX_MS = 5 * 60_000

// tsconfig は DOM の型なので、Worker の self として使う分だけ型を付ける
const worker = self as unknown as {
  onmessage: (event: MessageEvent<PackInput>) => void
  postMessage: (message: WorkerMessage) => void
}

worker.onmessage = (event) => {
  const search = createSearch(event.data)
  const started = Date.now()
  let lastImproved = started
  let lastPosted = 0
  let lastStats = 0
  let pending = true

  for (;;) {
    const now = Date.now()
    const elapsed = now - started
    // 良い結果は見つかるたびに送る（続けて見つかるときは間引く）
    if (pending && now - lastPosted > 150) {
      worker.postMessage({
        kind: 'best',
        result: search.best,
        tried: search.tried,
        elapsed,
      })
      pending = false
      lastPosted = now
    }
    if (now - lastStats > 500) {
      worker.postMessage({ kind: 'stats', tried: search.tried, elapsed })
      lastStats = now
    }
    if (search.exhausted || now - lastImproved > STALL_MS || elapsed > MAX_MS) {
      if (pending) {
        worker.postMessage({
          kind: 'best',
          result: search.best,
          tried: search.tried,
          elapsed,
        })
      }
      worker.postMessage({ kind: 'done', tried: search.tried, elapsed })
      return
    }
    if (search.step()) {
      lastImproved = Date.now()
      pending = true
    }
  }
}
