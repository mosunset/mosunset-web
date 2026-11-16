/**
 * この PC で動いているネイティブ版（native/box-packing、Rust + CUDA）とのやり取り。
 * ネイティブ版は 127.0.0.1:8787 で待っていて、mosunset.com と localhost のページからの頼みごとにだけ答える。
 * ページはネイティブ版を「速い計算係」として使い、ブラウザーの計算係（search.worker.ts）と同じ知らせ
 * （いちばん良い結果・部門別のいちばん・試した数・終わった）を、0.5 秒ごとに聞きに行く。
 * 点数の付け方はブラウザーの計算と同じ（同じ並べ方なら同じ点数になる）。
 */
import type { Genome, Metric, PackInput, PackResult } from './solver'

const BASE = 'http://127.0.0.1:8787'
/** ネイティブ版の窓口の形の版（server.rs の PAGE_API）。違えば使わない */
const API = 1
/** 様子を聞きに行く間隔 */
const POLL_MS = 500

export type NativeInfo = {
  /** CPU のスレッド数 */
  threads: number
  /** GPU の名前（まだ一度も計算していなければ分からない） */
  gpu: string | null
}

/** ネイティブ版が動いているか確かめる（動いていなければ null） */
export async function probeNative(timeoutMs = 800): Promise<NativeInfo | null> {
  try {
    const res = await fetch(`${BASE}/api/hello`, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const v = (await res.json()) as {
      app?: string
      api?: number
      threads?: number
      gpu?: string | null
    }
    if (v.app !== 'box-packing' || v.api !== API) return null
    return { threads: v.threads ?? 0, gpu: v.gpu ?? null }
  } catch {
    return null
  }
}

/**
 * ネイティブ版を立ち上げる（box-packing:// の呼び出し。`box-packing install` で登録したときだけ動く）。
 * 初めてのときは、ブラウザーが開いてよいか聞く
 */
export function launchNative() {
  const a = document.createElement('a')
  a.href = 'box-packing://start'
  a.click()
}

/** ネイティブ版に終わってもらう */
export async function quitNative() {
  try {
    await fetch(`${BASE}/api/quit`, { method: 'POST' })
  } catch {
    // すでに終わっている
  }
}

let nativeToken = 0

/**
 * ネイティブ版に、1 つの組み合わせの計算を頼む。止める関数を返す（ブラウザーの runWorker と同じ形）。
 * ネイティブ版につながらなくなったら lost を呼んでから done を呼ぶ
 */
export function runNative(
  input: PackInput,
  on: {
    best: (result: PackResult) => void
    metric: (metric: Metric, result: PackResult) => void
    progress: (tried: number) => void
    done: () => void
    lost: () => void
  },
): (() => void) & { adopt: (genome: Genome) => void } {
  const token = Date.now() * 1000 + (++nativeToken % 1000)
  let stopped = false
  let timer = 0
  let knownBest = 0
  const knownMetric = [0, 0, 0]
  const end = (lost: boolean) => {
    if (stopped) return
    stopped = true
    window.clearTimeout(timer)
    if (lost) on.lost()
    on.done()
  }
  const poll = async () => {
    if (stopped) return
    try {
      const res = await fetch(
        `${BASE}/api/page/poll?token=${token}&b=${knownBest}&m=${knownMetric.join(',')}`,
        { cache: 'no-store', signal: AbortSignal.timeout(5000) },
      )
      const v = (await res.json()) as {
        done: boolean
        missing?: boolean
        tried?: number
        best?: { v: number; result: PackResult } | null
        metrics?: ({ v: number; metric: Metric; result: PackResult } | null)[]
      }
      if (stopped) return
      if (v.tried !== undefined) on.progress(v.tried)
      if (v.best) {
        knownBest = v.best.v
        on.best(v.best.result)
      }
      v.metrics?.forEach((m, i) => {
        if (!m) return
        knownMetric[i] = m.v
        on.metric(m.metric, m.result)
      })
      // ほかのページが新しく頼んで、この計算が止められたときも終わり
      if (v.done || v.missing) {
        end(false)
        return
      }
    } catch {
      end(true)
      return
    }
    timer = window.setTimeout(poll, POLL_MS)
  }
  fetch(`${BASE}/api/page/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, input }),
  })
    .then((res) => {
      if (!res.ok) throw new Error(String(res.status))
      timer = window.setTimeout(poll, POLL_MS)
    })
    .catch(() => end(true))
  const stop = () => {
    if (stopped) return
    stopped = true
    window.clearTimeout(timer)
    void fetch(`${BASE}/api/page/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).catch(() => {})
  }
  // ネイティブ版は組み合わせごとに 1 つの係なので、ほかの係からの並べ方は受け取らない
  return Object.assign(stop, { adopt: (_genome: Genome) => {} })
}
