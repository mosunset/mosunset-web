// GPU 係の手伝い。GPU が見積もった上位の並べ方を、ふつうの計算で正式に評価して返す
// （GPU 係 1 つでは評価しきれない数を、CPU の空いているコアで分けて評価する）
import {
  evaluateIds,
  type PackInput,
  type PackResult,
  type Rule,
  type UnitTable,
  unitsOf,
} from './box-packing-solver'

/** GPU 係から: 設定（頼みごとが変わったときだけ送る）と、評価する並べ方 */
export type EvalRequest = {
  id: number
  run: number
  input?: PackInput
  plans: { ids: number[]; rule: Rule }[]
}

export type EvalReply = { id: number; results: PackResult[] }

const worker = self as unknown as {
  onmessage: (event: MessageEvent<EvalRequest>) => void
  postMessage: (message: EvalReply) => void
}

let cached: { run: number; input: PackInput; table: UnitTable } | null = null

worker.onmessage = (event) => {
  const req = event.data
  if (req.input) {
    cached = { run: req.run, input: req.input, table: unitsOf(req.input) }
  }
  if (!cached || cached.run !== req.run) {
    worker.postMessage({ id: req.id, results: [] })
    return
  }
  const { input, table } = cached
  worker.postMessage({
    id: req.id,
    results: req.plans.map((p) => evaluateIds(input, table, p.ids, p.rule)),
  })
}
