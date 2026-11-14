// 正規表現の実行を、画面を止めないよう別スレッドで行う。
// 重いパターン（破滅的バックトラック）で終わらないときは、画面の側がこの Worker ごと止めて作り直す

import { captureGroups } from './explain'
import {
  type GroupResult,
  MAX_MATCHES,
  type MatchResult,
  type RegexRequest,
  type RegexResponse,
} from './types'

const MAX_SPLIT = 5000

function run(req: RegexRequest): RegexResponse {
  const started = performance.now()
  // 位置を知るため、d（indices）は常に付けて実行する
  const flags = req.flags.includes('d') ? req.flags : `${req.flags}d`
  const groupDefs = captureGroups(req.source, flags)

  const toMatch = (m: RegExpExecArray): MatchResult => {
    const groups: GroupResult[] = []
    for (let n = 1; n < m.length; n++) {
      const range = m.indices?.[n]
      groups.push({
        number: n,
        name: groupDefs[n - 1]?.name,
        value: m[n],
        start: range?.[0],
        end: range?.[1],
      })
    }
    return {
      index: m.index,
      end: m.index + m[0].length,
      value: m[0],
      groups,
    }
  }

  const matches: MatchResult[] = []
  let truncated = false
  const re = new RegExp(req.source, flags)
  if (re.global) {
    // matchAll は長さ 0 のマッチでも先へ進めてくれる
    for (const m of req.text.matchAll(re)) {
      if (matches.length >= MAX_MATCHES) {
        truncated = true
        break
      }
      matches.push(toMatch(m as RegExpExecArray))
    }
  } else {
    const m = re.exec(req.text)
    if (m) matches.push(toMatch(m))
  }

  const replaced = req.text.replace(
    new RegExp(req.source, req.flags),
    req.replacement,
  )
  const split = req.text
    .split(new RegExp(req.source, req.flags), MAX_SPLIT)
    .map((s) => (s === undefined ? null : s))

  return {
    id: req.id,
    ok: true,
    matches,
    truncated,
    replaced,
    split,
    elapsed: performance.now() - started,
  }
}

self.onmessage = (e: MessageEvent<RegexRequest>) => {
  let res: RegexResponse
  try {
    res = run(e.data)
  } catch (err) {
    res = {
      id: e.data.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
  self.postMessage(res)
}
