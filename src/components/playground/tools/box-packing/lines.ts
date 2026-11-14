/**
 * 組み合わせごとの「別の筋」: いちばん良い並べ方から離れた場所を、ほかの係と並べ方をやり取りせずに探し続ける筋。
 * いつもの筋（いちばん良い並べ方から詰め、良いものが見つかるとすぐ係どうしで渡し合う）だけだと、
 * 係が全員同じ並べ方の近くに集まって、目先のこれ以上良くならない並べ方から抜け出しにくい。
 * 受け持ち（2 秒）をまたいで続けられるよう、筋ごとに見つけたいちばん良い並べ方を画面側で覚えておく。
 * 画面の部品は import しない（node でも動かして確かめられるように）
 */
import {
  FRESH_EVERY,
  type Genome,
  type PackInput,
  type PackResult,
  shakeLevelOf,
} from './solver'

/** CPU の係の受け持ちのうち、別の筋に回す割合 */
export const LINE_SHARE = 0.25
/** 1 つの組み合わせで同時に持つ別の筋の数 */
export const MAX_LINES = 2
/** 別の筋を捨てて新しい筋を始めるまでの、その筋のいちばんが良くならなかった試行の数 */
export const LINE_PATIENCE = 15_000

export type Line = {
  /** この筋で見つけたいちばん良い並べ方（まだなければ undefined） */
  genome?: Genome
  score: number
  /** 最初の出発点: from をこの強さで大きく崩す（from がなければ新しい並べ方から） */
  from?: Genome
  shake?: number
  /** この筋にかけた計算の時間（ルールを固める頃合いを決めるのに使う） */
  workMs: number
  /** この筋のいちばんが、続けて何回の試行で良くならなかったか */
  stale: number
  /** 今どれかの係が受け持っている */
  busy: boolean
}

export type Lines = {
  lines: Line[]
  /** 続けて何本の筋が、いちばん良い結果を超えられずに終わったか（多いほど、新しい筋は大きく崩す。shakeLevelOf） */
  kicks: number
  /** 始めた筋の数（何本かに 1 本は、新しい並べ方から始める） */
  made: number
}

export const createLines = (): Lines => ({ lines: [], kicks: 0, made: 0 })

/**
 * 次の受け持ちを別の筋にするか決める（LINE_SHARE の割合で）。
 * 別の筋にするなら、その筋と、頼む計算の設定に上書きする分を返す。しないなら null
 */
export function pickLine(
  state: Lines,
  /** 組み合わせのいちばん良い並べ方（新しい筋の出発点にする） */
  best: Genome | undefined,
  rand: () => number,
): { line: Line; patch: Partial<PackInput> } | null {
  if (rand() >= LINE_SHARE) return null
  // 長く良くならない筋は捨てる（いちばん良い結果を超えられなかったので、次の筋はもっと遠くから始める）
  state.lines = state.lines.filter((l) => {
    if (l.busy || l.stale < LINE_PATIENCE) return true
    state.kicks++
    return false
  })
  // 空いている筋があれば、計算をかけた時間が少ないものの続きから
  let line = state.lines
    .filter((l) => !l.busy)
    .sort((a, b) => a.workMs - b.workMs)[0]
  if (!line) {
    if (state.lines.length >= MAX_LINES) return null
    state.made++
    const fresh = !best || state.made % FRESH_EVERY === 0
    line = {
      score: Number.POSITIVE_INFINITY,
      from: fresh ? undefined : best,
      shake: fresh ? undefined : shakeLevelOf(state.kicks),
      workMs: 0,
      stale: 0,
      busy: false,
    }
    state.lines.push(line)
  }
  line.busy = true
  const patch: Partial<PackInput> = line.genome
    ? {
        explore: true,
        startGenome: line.genome,
        startOrder: undefined,
        shake: undefined,
        searchedMs: line.workMs,
      }
    : {
        explore: true,
        startGenome: line.from,
        startOrder: undefined,
        shake: line.shake,
        searchedMs: 0,
      }
  return { line, patch }
}

/**
 * 別の筋の受け持ちが終わった。見つけたいちばん良い並べ方を覚える。
 * 組み合わせのいちばん良い結果になった筋は、いつもの筋と同じ場所になったので、別の筋としては終える
 */
export function endLine(
  state: Lines,
  line: Line,
  /** この受け持ちで見つけたいちばん良い結果 */
  found: PackResult | undefined,
  ms: number,
  tried: number,
  /** 組み合わせのいちばん良い点数 */
  comboBest: number | undefined,
) {
  line.busy = false
  line.workMs += ms
  if (found?.genome && found.score < line.score - 1e-9) {
    line.genome = found.genome
    line.score = found.score
    line.stale = 0
  } else line.stale += tried
  if (comboBest !== undefined && line.score <= comboBest + 1e-9) {
    state.lines = state.lines.filter((l) => l !== line)
  }
}

/** 組み合わせのいちばん良い結果が良くなった（行き詰まっていないので、大きく崩す強さを戻す） */
export function comboImproved(state: Lines) {
  state.kicks = 0
}
