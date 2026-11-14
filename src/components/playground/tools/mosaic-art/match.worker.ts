// タイル選び（マスの数 × 写真の数だけ色を比べる）を、画面を止めないよう別スレッドで行う
import { type MatchInput, matchTiles } from './mosaic'

export type MatchRequest = { id: number } & MatchInput

export type MatchReply =
  | { id: number; type: 'progress'; done: number }
  | { id: number; type: 'done'; assignment: Int32Array }

self.onmessage = (e: MessageEvent<MatchRequest>) => {
  const { id, ...input } = e.data
  const assignment = matchTiles(input, (done) => {
    self.postMessage({ id, type: 'progress', done } satisfies MatchReply)
  })
  self.postMessage({ id, type: 'done', assignment } satisfies MatchReply, {
    transfer: [assignment.buffer],
  })
}
