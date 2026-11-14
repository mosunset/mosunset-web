// 画面と Worker の間でやり取りする形（Worker のファイルを画面から import すると、Worker の処理まで動いてしまうので分ける）

export type RegexRequest = {
  id: number
  source: string
  flags: string
  text: string
  replacement: string
}

export type GroupResult = {
  /** グループの番号（1 から） */
  number: number
  name?: string
  /** マッチに加わらなかったグループは undefined */
  value?: string
  start?: number
  end?: number
}

export type MatchResult = {
  index: number
  end: number
  value: string
  groups: GroupResult[]
}

export type RegexResponse =
  | {
      id: number
      ok: true
      matches: MatchResult[]
      /** 上限を超えたので途中で数えるのをやめた */
      truncated: boolean
      replaced: string
      split: (string | null)[]
      elapsed: number
    }
  | { id: number; ok: false; error: string }

/** 一覧と強調表示に出すマッチの上限（それより多いと画面が重くなる） */
export const MAX_MATCHES = 5000
