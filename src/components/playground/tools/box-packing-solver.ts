/**
 * 箱詰めの計算（Web Worker の中で動かす。画面の部品は import しない）。
 * 仕様は box-packing-spec.tsx。
 *
 * 座標: x は床の幅（右が +）、y は奥行き（奥が +、手前が 0）、z は高さ。単位は mm の整数。
 *
 * ぴったりの最適解を出すのは難しい問題なので、並べる順番を何通りも試し、
 * 1 個ずつ「その時点でいちばん良い場所」に置いていく。並べ順を少しずつ入れ替えながら、
 * 良い結果が見つかるたびに知らせる（createSearch）。
 */

export type Walls = { back: boolean; left: boolean; right: boolean }

export type BoxSpec = {
  /** 何の箱か分かるための自由な文字 */
  tag: string
  /** 入力したときの幅（x）・奥行き（y）・高さ（z） */
  x: number
  y: number
  z: number
  count: number
  /** 横倒しにしてよいか（許可。倒すかどうかは計算で決める） */
  canLayDown: boolean
}

/** height: 全体の高さを低く / floor: 下の段から隙間なく */
export type Objective = 'height' | 'floor'

/**
 * 見た目の整い（人の感覚）。weight（0〜100）が 0 なら使わない。
 * group: 同じ箱がまとまっている / flat: 上の面が平ら / bigBottom: 大きい箱が下 / upright: 横倒しが少ない
 * even: くぼみや飛び出しがない / bigWall: 大きい箱が壁側（壁があるとき）/ front: 箱の正面が手前を向く /
 * frontFlat: 手前の面がそろう / near: リストで近い箱どうしが近くにある / balance: 左右の釣り合い（横の壁が片側だけでないとき）
 */
export type Tidy = {
  weight: number
  group: boolean
  flat: boolean
  bigBottom: boolean
  upright: boolean
  even: boolean
  bigWall: boolean
  front: boolean
  frontFlat: boolean
  near: boolean
  balance: boolean
}

export type PackInput = {
  floorX: number
  floorY: number
  walls: Walls
  boxes: BoxSpec[]
  /** 箱どうしのすき間 */
  gap: number
  /** 箱と、床の端・壁とのすき間 */
  edgeGap: number
  /** 底面のうち、下から支えられていないといけない割合（%） */
  supportPercent: number
  objective: Objective
  /** 壁があるとき、重心をどれだけ壁側に寄せるか（0〜100） */
  wallBias: number
  /** 見た目の整い（人の感覚）をどれだけ重視するか */
  tidy: Tidy
  /** 並べ順を入れ替えるときの乱数の種 */
  seed: number
  /**
   * 出発点にする並べ順（箱の種類の番号の列）。前に良かった結果から続けて詰めるときに渡す。
   * 箱の数が合わない分は、ふつうの並べ順で補う
   */
  startOrder?: number[]
  /** 出発点にする並べ方（前に良かった結果の genome）。startOrder より優先する */
  startGenome?: Genome
}

/** 箱の面の名前（入力したときの向きが基準。Z が上、Y が奥） */
export type FaceLabel = '上' | '下' | '左' | '右' | '前' | '後'

export type Placement = {
  /** BoxSpec の番号 */
  type: number
  x: number
  y: number
  z: number
  /** 置いた向きでの寸法 */
  w: number
  d: number
  h: number
  /** 置いた向きで、+X・-X・+Y・-Y・+Z・-Z を向いている面（three.js の BoxGeometry の面の順） */
  faces: FaceLabel[]
  laidDown: boolean
}

export type Unplaced = {
  type: number
  count: number
  reason: 'too-big' | 'support'
}

export type PackResult = {
  placements: Placement[]
  unplaced: Unplaced[]
  height: number
  /** 箱の体積の合計 ÷（床の面積 × 高さ） */
  fillRate: number
  /** 床に直接置いた箱の底面積 ÷ 床の面積 */
  floorCoverage: number
  /** 全体の重心（箱の重さは体積に比例するとみなす） */
  cog: { x: number; y: number; z: number } | null
  /** 見た目の整い（0〜1。大きいほど整っている。使う見る点の平均） */
  tidiness: number
  /** 小さいほど良い */
  score: number
  /** この結果になった並べ方（続けて詰めるときの出発点にする） */
  genome?: Genome
}

// ---- 箱の向き ----

type Orientation = {
  w: number
  d: number
  h: number
  faces: FaceLabel[]
  laidDown: boolean
  /** この寸法の置き方で、箱の正面（「前」の面）を手前に向けられるか（かたまりの置き方で使う） */
  frontOK?: boolean
}

/** 元の軸（0: x, 1: y, 2: z）と向き（+1 / -1）から面の名前 */
const faceName: Record<string, FaceLabel> = {
  '0,1': '右',
  '0,-1': '左',
  '1,1': '後',
  '1,-1': '前',
  '2,1': '上',
  '2,-1': '下',
}

const permutations = [
  [0, 1, 2],
  [1, 0, 2],
  [0, 2, 1],
  [2, 0, 1],
  [1, 2, 0],
  [2, 1, 0],
]

/** 置換の偶奇（行列式の符号） */
function parity(p: number[]) {
  let sign = 1
  for (let i = 0; i < 3; i++)
    for (let j = i + 1; j < 3; j++) if (p[i] > p[j]) sign = -sign
  return sign
}

/**
 * 上に向けてよい面。そのまま置くなら「上」、横倒しは「前」か「左」が上になる向きだけ
 * （「下」「後」「右」を上にする置き方はしない）
 */
const allowedUp: readonly FaceLabel[] = ['上', '前', '左']

/**
 * 箱の置き方の一覧。回転（鏡に映した形にはしない）だけを考え、
 * 上を向く面が allowedUp に入る向きだけにする。横倒しは許されたときだけ
 */
export function orientationsOf(box: BoxSpec, all = false): Orientation[] {
  const dims = [box.x, box.y, box.z]
  const result: Orientation[] = []
  const seen = new Set<string>()
  for (const p of permutations) {
    for (let s = 0; s < 8; s++) {
      const signs = [s & 1 ? -1 : 1, s & 2 ? -1 : 1, s & 4 ? -1 : 1]
      if (parity(p) * signs[0] * signs[1] * signs[2] !== 1) continue
      // 置いたときの軸 i には、元の軸 p[i] が signs[i] の向きで来る
      const faces: FaceLabel[] = []
      for (let i = 0; i < 3; i++) {
        faces.push(faceName[`${p[i]},${signs[i]}`])
        faces.push(faceName[`${p[i]},${-signs[i]}`])
      }
      // faces[4] が、置いたときに上（+Z）を向く面
      const up = faces[4]
      const upright = up === '上'
      if (!allowedUp.includes(up) || (!upright && !box.canLayDown)) continue
      const w = dims[p[0]]
      const d = dims[p[1]]
      const h = dims[p[2]]
      // 同じ寸法でも上を向く面が違えば別の置き方（文字の向きが変わる）だが、
      // 積み方は寸法だけで決まるので、寸法が同じものは 1 つにまとめる
      const key = `${w}x${d}x${h}`
      if (!all && seen.has(key)) continue
      seen.add(key)
      result.push({ w, d, h, faces, laidDown: !upright })
    }
  }
  return result
}

/** 床（端のすき間を除いた範囲）に置ける向きがあるか */
export function fitsFloor(
  box: BoxSpec,
  input: Pick<PackInput, 'floorX' | 'floorY' | 'edgeGap'>,
) {
  const u = input.floorX - 2 * input.edgeGap
  const v = input.floorY - 2 * input.edgeGap
  return orientationsOf(box).some((o) => o.w <= u && o.d <= v)
}

// ---- かたまり（同じ寸法の箱をまとめて置く） ----

/**
 * 同じ寸法の箱のまとまり（タグは問わない。床の上で 90° 回して同じなら同じ寸法、横倒しの許可も同じもの）。
 * members は、まとまりに入る箱の種類の番号を 1 個ずつ並べたもの
 */
type Group = {
  members: number[]
  orientations: Orientation[]
}

/**
 * 置く単位。同じ寸法の箱を、横に a 個 × 奥に b 個 × 上に c 段 並べたかたまり（1×1×1 はばらの箱 1 個）。
 * 横・奥の箱どうしはすき間をあけ、上下はそのまま積む。
 * orientations はかたまりの置き方で、base は、それぞれの置き方でのかたまりの中の箱 1 個の置き方（Group の orientations の番号）
 */
export type Unit = {
  group: number
  a: number
  b: number
  c: number
  size: number
  code: number
  /** リストでの並び順（0〜1000） */
  rank: number
  orientations: Orientation[]
  base: number[]
}

/** かたまりの形の上限（横 × 奥は 8 個まで、1 辺 4 個まで、3 段まで、全部で 12 個まで） */
const MAX_SIDE = 4
const MAX_FLOOR = 8
const MAX_STACK = 3
const MAX_UNIT = 12

/** かたまりの形の番号（まとまりの番号と a・b・c から決まる。設定が違っても同じ床と箱なら同じ番号） */
const codeOf = (group: number, a: number, b: number, c: number) =>
  group * 64 + (c - 1) * 16 + (a - 1) * 4 + (b - 1)

/** まとまり g の a × b × c のかたまりの単位の番号（作れない形なら undefined） */
function unitAt(table: UnitTable, g: number, a: number, b: number, c: number) {
  if (a < 1 || b < 1 || c < 1 || a > MAX_SIDE || b > MAX_SIDE || c > MAX_STACK)
    return undefined
  return table.byCode.get(codeOf(g, a, b, c))
}

/**
 * 置く単位の一覧。まとまりごとに、作れるかたまりの形を全部並べる（床に収まらない形は入れない）。
 * single[g] は、まとまり g のばらの箱 1 個の単位の番号
 */
export function unitsOf(input: PackInput) {
  const groups: Group[] = []
  const tooBig: Unplaced[] = []
  const keyIndex = new Map<string, number>()
  /** 種類ごとの置き方（まとめない一覧。箱の面の名前と、正面を手前に向けられるかを決めるのに使う） */
  const orientsByType: Orientation[][] = []
  input.boxes.forEach((box, type) => {
    orientsByType[type] = orientationsOf(box, true)
    if (box.count <= 0) return
    if (!fitsFloor(box, input)) {
      tooBig.push({ type, count: box.count, reason: 'too-big' })
      return
    }
    // 正面の向きが変わらないよう、入力の向き（X・Y・Z）まで同じものだけを同じ寸法とみなす
    const key = `${box.x}x${box.y}x${box.z}:${box.canLayDown ? 1 : 0}`
    let g = keyIndex.get(key)
    if (g === undefined) {
      g = groups.length
      keyIndex.set(key, g)
      groups.push({ members: [], orientations: orientationsOf(box) })
    }
    for (let i = 0; i < box.count; i++) groups[g].members.push(type)
  })
  const U = input.floorX - 2 * input.edgeGap
  const V = input.floorY - 2 * input.edgeGap
  const gap = input.gap
  const units: Unit[] = []
  const single: number[] = []
  const byCode = new Map<number, number>()
  // リストでの並び順（使う箱の中での順番を 0〜1000 にそろえる）。まとまりは中の箱の平均
  const present = [...new Set(groups.flatMap((g) => g.members))].sort(
    (a, b) => a - b,
  )
  const rankOfType = new Map(present.map((t, i) => [t, i]))
  const rankScale = 1000 / Math.max(1, present.length - 1)
  groups.forEach((g, gi) => {
    const n = g.members.length
    const rank = Math.round(
      (g.members.reduce((a, t) => a + (rankOfType.get(t) ?? 0), 0) / n) *
        rankScale,
    )
    const all = orientsByType[g.members[0]]
    for (let c = 1; c <= MAX_STACK; c++) {
      for (let a = 1; a <= MAX_SIDE; a++) {
        for (let b = 1; b <= MAX_SIDE; b++) {
          const size = a * b * c
          if (size > n || size > MAX_UNIT || a * b > MAX_FLOOR) continue
          const orientations: Orientation[] = []
          const base: number[] = []
          const seen = new Set<string>()
          g.orientations.forEach((o, oi) => {
            const w = a * o.w + (a - 1) * gap
            const d = b * o.d + (b - 1) * gap
            const h = c * o.h
            if (w > U || d > V) return
            const key = `${w}x${d}x${h}`
            if (seen.has(key)) return
            seen.add(key)
            const frontOK = all.some(
              (x) =>
                x.w === o.w &&
                x.d === o.d &&
                x.h === o.h &&
                x.laidDown === o.laidDown &&
                x.faces[3] === '前',
            )
            orientations.push({
              w,
              d,
              h,
              faces: o.faces,
              laidDown: o.laidDown,
              frontOK,
            })
            base.push(oi)
          })
          if (orientations.length === 0) continue
          const code = codeOf(gi, a, b, c)
          if (size === 1) single[gi] = units.length
          byCode.set(code, units.length)
          units.push({
            group: gi,
            a,
            b,
            c,
            size,
            code,
            rank,
            orientations,
            base,
          })
        }
      }
    }
  })
  const boxCount = groups.reduce((s, g) => s + g.members.length, 0)
  return { groups, units, single, byCode, tooBig, boxCount, orientsByType }
}

export type UnitTable = ReturnType<typeof unitsOf>

// ---- 置き方の決め方（ルール） ----

/**
 * 置く場所を比べるときに見る点（どれも 0 以上の整数で、小さいほど良い）。
 * - rise: 全体の高さが上がる分（mm）/ top: 上面の高さ（mm）/ z: 置く高さ（mm）
 * - laid: 横倒しなら 100 / open: まわりに接していない割合（0〜1000）
 * - along1・along2: 置き始める角からの距離（壁に沿う向きが先、mm）
 * - unflush: となりの箱と上面の高さがそろっていない割合（0〜1000）
 * - unaligned: となりや下の箱と端がそろっていない割合（0〜1000）
 * - notSame: となりの箱のうち、同じ寸法の箱でない割合（0〜1000）
 * - sideways: 箱の正面を手前に向けられない置き方なら 100
 * - farOrder: となりの箱との、リストでの並び順の離れ具合（0〜1000）
 * ルールは見る点ごとの重みの段階（0 は見ない。1 段上がるごとに重みが 2 倍）で、重みを掛けた合計がいちばん小さい場所に置く。
 * どれを優先するかも決め打ちせず、並べ順と一緒に探す
 */
export const ruleKeys = [
  'rise',
  'top',
  'z',
  'laid',
  'open',
  'along1',
  'along2',
  'unflush',
  'unaligned',
  'notSame',
  'sideways',
  'farOrder',
] as const
export const RULE_SIZE = ruleKeys.length
/** 重みの段階の上限（11 で重み 1024） */
export const RULE_MAX = 11
export type Rule = number[]
export const weightOf = (e: number) => (e <= 0 ? 0 : 2 ** (e - 1))

/** 最初に試すルール（今までの決め方に近いもの・人の積み方に近いもの・接する面を重く見るもの） */
export function defaultRules(input: PackInput): Rule[] {
  const t = input.tidy.weight > 0
  const up = t && input.tidy.upright ? 5 : 0
  const same = t && input.tidy.group ? 5 : 2
  const front = t && input.tidy.front ? 5 : 0
  const near = t && input.tidy.near ? 5 : 0
  return [
    input.objective === 'height'
      ? [11, 8, 6, up, 4, 2, 1, 0, 0, same, front, near]
      : [3, 8, 11, up, 5, 2, 1, 0, 0, same, front, near],
    [9, 7, 5, up, 6, 2, 1, 8, 8, same + 2, front + 2, near + 2],
    [8, 6, 4, up, 9, 2, 1, 5, 5, same, front, near],
  ]
}

/** 並べ方の遺伝子: 置く単位の形の番号の列（code）と、置き方の決め方（rule） */
export type Genome = { seq: number[]; rule: Rule }

// ---- 1 つの並べ方で置いていく ----

/** 置いた単位（u・v は、置き始める角を原点にした座標） */
type Placed = Orientation & {
  unit: number
  group: number
  /** リストでの並び順（0〜1000） */
  rank: number
  /** かたまりの置き方の番号 */
  oi: number
  size: number
  u: number
  v: number
  z: number
}

/**
 * 置き始める角。奥に壁があれば奥から、右の壁だけなら右から詰める。
 * 壁がない向きは、あとで全体を床の中央へ動かす
 */
export function anchorOf(walls: Walls) {
  return {
    fromRight: walls.right && !walls.left,
    fromBack: walls.back,
    /** 壁に沿って詰めるのは、どちらの向きを先にするか */
    alongSideFirst: (walls.left || walls.right) && !walls.back,
  }
}

/**
 * 置いた箱を床のマス目に登録しておき、ある範囲の近くにある箱だけを取り出す。
 * 箱が多いときに、置く場所の候補ごとに全部の箱を調べ直さずに済む
 */
class Grid {
  private readonly cells: number[][]
  private readonly cols: number
  private readonly cw: number
  private readonly ch: number
  private readonly marks: Uint32Array
  private stamp = 0

  /** cell はマス目 1 つの大きさの目安（箱の 1 辺くらいにすると、調べるマスも箱も少なくて済む） */
  constructor(U: number, V: number, capacity: number, cell: number) {
    this.cols = Math.max(2, Math.min(32, Math.round(Math.max(U, V) / cell)))
    this.cw = U / this.cols
    this.ch = V / this.cols
    this.cells = Array.from({ length: this.cols * this.cols }, () => [])
    this.marks = new Uint32Array(Math.max(1, capacity))
  }

  private range(u0: number, v0: number, u1: number, v1: number) {
    const last = this.cols - 1
    const clamp = (n: number) => Math.max(0, Math.min(last, n))
    return [
      clamp(Math.floor(u0 / this.cw)),
      clamp(Math.floor(v0 / this.ch)),
      // 範囲の右・奥の端はふくまない（座標は整数）
      clamp(Math.floor((u1 - 1) / this.cw)),
      clamp(Math.floor((v1 - 1) / this.ch)),
    ]
  }

  add(id: number, u0: number, v0: number, u1: number, v1: number) {
    const [i0, j0, i1, j1] = this.range(u0, v0, u1, v1)
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) this.cells[i * this.cols + j].push(id)
  }

  /** 範囲に重なるマスに登録された箱の番号を out に入れる（重複なし） */
  query(u0: number, v0: number, u1: number, v1: number, out: number[]) {
    out.length = 0
    this.stamp++
    const [i0, j0, i1, j1] = this.range(u0, v0, u1, v1)
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        for (const id of this.cells[i * this.cols + j]) {
          if (this.marks[id] === this.stamp) continue
          this.marks[id] = this.stamp
          out.push(id)
        }
      }
    }
  }
}

/** 置いた箱がこれより少ないうちは、マス目を使わずに全部を調べたほうが速い */
const SMALL = 40

/**
 * 1 つの並べ方で置いた記録。置いた単位は後ろに足していくだけなので、
 * 「i 番目まで置いた時点」の状態は、各時点の個数を覚えておけば取り出せる
 */
type Trace = {
  placed: Placed[]
  /** 置けなかった単位の番号 */
  unplaced: number[]
  height: number
  /** 並べ順の i 番目を置き終えた時点での、置いた数・置けなかった数・高さ */
  placedAfter: number[]
  unplacedAfter: number[]
  heightAfter: number[]
}

/**
 * 並べ順（置く単位の番号の列）のとおりに 1 つずつ置いていく。置く場所はルールの重み（weights）で選ぶ。
 * base と from を渡すと、base の並べ順・ルールと from 番目より前が同じとみなし、そこから先だけを置き直す。
 * GPU の計算（box-packing-gpu.ts）も同じ決め方をする
 */
function packInOrder(
  order: readonly number[],
  weights: readonly number[],
  input: PackInput,
  table: UnitTable,
  base?: Trace,
  from = 0,
): Trace {
  const { gap } = input
  const U = input.floorX - 2 * input.edgeGap
  const V = input.floorY - 2 * input.edgeGap
  const anchor = anchorOf(input.walls)
  const W = weights
  const start = base ? from : 0
  const placed = base
    ? base.placed.slice(0, start > 0 ? base.placedAfter[start - 1] : 0)
    : []
  const unplaced = base
    ? base.unplaced.slice(0, start > 0 ? base.unplacedAfter[start - 1] : 0)
    : []
  let height = base && start > 0 ? base.heightAfter[start - 1] : 0
  const placedAfter = base ? base.placedAfter.slice(0, start) : []
  const unplacedAfter = base ? base.unplacedAfter.slice(0, start) : []
  const heightAfter = base ? base.heightAfter.slice(0, start) : []

  // 置く場所の候補（左・手前の端を、床の端か、置いた箱の右・奥の端 ＋ すき間にそろえる）
  const us = new Set([0])
  const vs = new Set([0])
  // 箱が多いときは組み合わせが増えすぎるので、置いた箱の角のまわりだけを候補にする
  const points: [number, number][] = [[0, 0]]
  const pointKeys = new Set([0])
  const addPoint = (u: number, v: number) => {
    if (u >= U || v >= V) return
    const key = u * 1_000_003 + v
    if (pointKeys.has(key)) return
    pointKeys.add(key)
    points.push([u, v])
  }
  const sides = order.map((id) => {
    const o = table.units[id].orientations[0]
    return Math.min(o.w, o.d)
  })
  const grid = new Grid(
    U,
    V,
    order.length,
    sides.reduce((a, b) => a + b, 0) / Math.max(1, sides.length),
  )
  /** 置いた単位の番号（少ないうちは、マス目を使わずに全部を調べる） */
  const all: number[] = []
  const register = (p: Placed, id: number) => {
    us.add(p.u + p.w + gap)
    vs.add(p.v + p.d + gap)
    addPoint(p.u + p.w + gap, p.v)
    addPoint(p.u, p.v + p.d + gap)
    addPoint(p.u, p.v)
    addPoint(p.u + p.w + gap, 0)
    addPoint(0, p.v + p.d + gap)
    all.push(id)
    // すき間の分だけ広げて登録すると、すき間の確認に要る箱も取り出せる
    grid.add(id, p.u - gap, p.v - gap, p.u + p.w + gap, p.v + p.d + gap)
  }
  placed.forEach(register)

  const found: number[] = []
  for (let index = start; index < order.length; index++) {
    const unitId = order[index]
    const item = table.units[unitId]
    let best: { score: number; p: Placed } | null = null
    const candidates: Iterable<[number, number]> =
      us.size * vs.size <= 2500
        ? (function* () {
            for (const u of us)
              for (const v of vs) yield [u, v] as [number, number]
          })()
        : points

    for (const [u, v] of candidates) {
      const a1 = anchor.alongSideFirst ? u : v
      const a2 = anchor.alongSideFirst ? v : u
      for (let oi = 0; oi < item.orientations.length; oi++) {
        const o = item.orientations[oi]
        if (u + o.w > U || v + o.d > V) continue
        // 場所と向きだけで決まる点と、置く高さで決まる点。接する面などの点は 0 以上なので、
        // ここまでで今の最良に勝てない場所は、調べるまでもない
        const fixed =
          W[3] * (o.laidDown ? 100 : 0) +
          W[5] * a1 +
          W[6] * a2 +
          W[10] * (o.frontOK ? 0 : 100)
        const at = (z: number) =>
          W[0] * (Math.max(height, z + o.h) - height) +
          W[1] * (z + o.h) +
          W[2] * z +
          fixed
        if (best && at(0) >= best.score) continue
        let near = all
        if (all.length > SMALL) {
          grid.query(u, v, u + o.w, v + o.d, found)
          near = found
        }

        // 真下にある箱のいちばん高い上面に乗せる
        let z = 0
        for (const id of near) {
          const b = placed[id]
          if (
            u < b.u + b.w &&
            b.u < u + o.w &&
            v < b.v + b.d &&
            b.v < v + o.d &&
            b.z + b.h > z
          ) {
            z = b.z + b.h
          }
        }
        if (best && at(z) >= best.score) continue

        // 横に並ぶ箱（高さの範囲が重なる箱）とは、すき間をあける
        let blocked = false
        for (const id of near) {
          const b = placed[id]
          if (b.z >= z + o.h || b.z + b.h <= z) continue
          if (
            u < b.u + b.w + gap &&
            b.u < u + o.w + gap &&
            v < b.v + b.d + gap &&
            b.v < v + o.d + gap
          ) {
            blocked = true
            break
          }
        }
        if (blocked) continue

        // 底面がどれだけ支えられているか（ちょうど z の高さに上面がある箱との重なり）。
        // 下の箱と端がそろっているかも数える
        let align = 0
        if (z > 0) {
          let supported = 0
          for (const id of near) {
            const b = placed[id]
            if (b.z + b.h !== z) continue
            const ou = Math.min(u + o.w, b.u + b.w) - Math.max(u, b.u)
            const ov = Math.min(v + o.d, b.v + b.d) - Math.max(v, b.v)
            if (ou > 0 && ov > 0) {
              supported += ou * ov
              if (b.u === u) align++
              if (b.u + b.w === u + o.w) align++
              if (b.v === v) align++
              if (b.v + b.d === v + o.d) align++
            }
          }
          if (supported * 100 < input.supportPercent * o.w * o.d) continue
        }

        // まわりに接している面積（床の端か、ちょうどすき間の分だけ離れて並ぶ箱と向き合う面積）、
        // となりの箱との接触のうち同じ寸法の箱の分、上面がそろっているとなりの長さ、端がそろっているか
        let contact = 0
        if (u === 0) contact += o.d * o.h
        if (u + o.w === U) contact += o.d * o.h
        if (v === 0) contact += o.w * o.h
        if (v + o.d === V) contact += o.w * o.h
        let boxContact = 0
        let same = 0
        let flush = 0
        let sideLen = 0
        let farSum = 0
        let side = all
        if (all.length > SMALL) {
          // すき間の分だけ離れた箱も入るよう、1 だけ広げて探す
          grid.query(u - 1, v - 1, u + o.w + 1, v + o.d + 1, found)
          side = found
        }
        for (const id of side) {
          const b = placed[id]
          const oz = Math.min(z + o.h, b.z + b.h) - Math.max(z, b.z)
          if (oz <= 0) continue
          const isSame = b.group === item.group
          const flat = b.z + b.h === z + o.h
          const ov = Math.min(v + o.d, b.v + b.d) - Math.max(v, b.v)
          if (ov > 0 && (b.u + b.w + gap === u || u + o.w + gap === b.u)) {
            contact += ov * oz
            boxContact += ov * oz
            if (isSame) same += ov * oz
            if (flat) flush += ov
            sideLen += ov
            farSum += ov * Math.abs(b.rank - item.rank)
            if (b.v === v) align++
            if (b.v + b.d === v + o.d) align++
          }
          const ou = Math.min(u + o.w, b.u + b.w) - Math.max(u, b.u)
          if (ou > 0 && (b.v + b.d + gap === v || v + o.d + gap === b.v)) {
            contact += ou * oz
            boxContact += ou * oz
            if (isSame) same += ou * oz
            if (flat) flush += ou
            sideLen += ou
            farSum += ou * Math.abs(b.rank - item.rank)
            if (b.u === u) align++
            if (b.u + b.w === u + o.w) align++
          }
        }
        const open =
          1000 -
          Math.min(
            1000,
            Math.floor(
              contact / Math.max(1, Math.floor((2 * (o.w + o.d) * o.h) / 1000)),
            ),
          )
        const unflush =
          1000 - Math.min(1000, Math.floor((flush * 1000) / (2 * (o.w + o.d))))
        const unaligned = 1000 - Math.min(8, align) * 125
        const notSame =
          boxContact > 0
            ? 1000 -
              Math.min(
                1000,
                Math.floor(same / Math.max(1, Math.floor(boxContact / 1000))),
              )
            : 1000
        const farOrder = sideLen > 0 ? Math.floor(farSum / sideLen) : 1000
        const score =
          at(z) +
          W[4] * open +
          W[7] * unflush +
          W[8] * unaligned +
          W[9] * notSame +
          W[11] * farOrder
        if (best && score >= best.score) continue

        best = {
          score,
          p: {
            ...o,
            unit: unitId,
            group: item.group,
            rank: item.rank,
            oi,
            size: item.size,
            u,
            v,
            z,
          },
        }
      }
    }

    if (best) {
      placed.push(best.p)
      register(best.p, placed.length - 1)
      height = Math.max(height, best.p.z + best.p.h)
    } else {
      unplaced.push(unitId)
    }
    placedAfter.push(placed.length)
    unplacedAfter.push(unplaced.length)
    heightAfter.push(height)
  }

  return { placed, unplaced, height, placedAfter, unplacedAfter, heightAfter }
}

// ---- 結果を床の座標に直して、評価する ----

function finish(
  packed: Trace,
  input: PackInput,
  table: UnitTable,
  genome?: Genome,
): PackResult {
  const { floorX: X, floorY: Y, edgeGap: e, walls, gap } = input
  const anchor = anchorOf(walls)
  const tooBig = table.tooBig
  // かたまりを箱 1 個ずつに戻す。まとまりの中の箱の種類は、並べた順に割り当てる
  const cursor = new Int32Array(table.groups.length)
  const takeType = (g: number) => table.groups[g].members[cursor[g]++]
  let placements: Placement[] = []
  for (const p of packed.placed) {
    const unit = table.units[p.unit]
    const bo = table.groups[p.group].orientations[unit.base[p.oi]]
    for (let ic = 0; ic < unit.c; ic++) {
      for (let ib = 0; ib < unit.b; ib++) {
        for (let ia = 0; ia < unit.a; ia++) {
          const type = takeType(p.group)
          // 同じ寸法でも入力の向きが違う箱があるので、面の名前はその箱の置き方から取る
          const own = table.orientsByType[type]
          const fits = (x: Orientation) =>
            x.w === bo.w &&
            x.d === bo.d &&
            x.h === bo.h &&
            x.laidDown === bo.laidDown
          const o =
            own.find((x) => fits(x) && x.faces[3] === '前') ??
            own.find(fits) ??
            own.find((x) => x.w === bo.w && x.d === bo.d && x.h === bo.h) ??
            bo
          const bu = p.u + ia * (bo.w + gap)
          const bv = p.v + ib * (bo.d + gap)
          placements.push({
            type,
            x: anchor.fromRight ? X - e - bu - bo.w : e + bu,
            y: anchor.fromBack ? Y - e - bv - bo.d : e + bv,
            z: p.z + ic * bo.h,
            w: bo.w,
            d: bo.d,
            h: bo.h,
            faces: o.faces,
            laidDown: o.laidDown,
          })
        }
      }
    }
  }
  const unplacedTypes: number[] = []
  for (const id of packed.unplaced) {
    const unit = table.units[id]
    for (let i = 0; i < unit.size; i++) unplacedTypes.push(takeType(unit.group))
  }

  // 壁がない向き（と、左右両方に壁がある向き）は、全体を床の中央へ寄せる。
  // 片側だけに壁がある向きは、壁に付けたままにする
  const centerX = walls.left === walls.right
  const centerY = !walls.back
  if (placements.length > 0 && (centerX || centerY)) {
    const minX = Math.min(...placements.map((p) => p.x))
    const maxX = Math.max(...placements.map((p) => p.x + p.w))
    const minY = Math.min(...placements.map((p) => p.y))
    const maxY = Math.max(...placements.map((p) => p.y + p.d))
    const shift = (min: number, max: number, size: number) =>
      Math.round((size - max - min) / 2)
    const dx = centerX ? shift(minX, maxX, X) : 0
    const dy = centerY ? shift(minY, maxY, Y) : 0
    placements = placements.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }))
  }

  let boxVolume = 0
  let floorArea = 0
  let cx = 0
  let cy = 0
  let cz = 0
  for (const p of placements) {
    const vol = p.w * p.d * p.h
    boxVolume += vol
    if (p.z === 0) floorArea += p.w * p.d
    cx += vol * (p.x + p.w / 2)
    cy += vol * (p.y + p.d / 2)
    cz += vol * (p.z + p.h / 2)
  }
  const height = packed.height
  const cog =
    boxVolume > 0
      ? { x: cx / boxVolume, y: cy / boxVolume, z: cz / boxVolume }
      : null
  const floorCoverage = floorArea / (X * Y)

  // 高さの目安（箱を溶かして床に流したときの高さ）。評価の数字をそろえるのに使う
  const allVolume = input.boxes.reduce(
    (s, b) => s + b.x * b.y * b.z * b.count,
    0,
  )
  const h0 = Math.max(1, allVolume / (X * Y))

  const cogError = cog ? cogErrorOf(cog.x, cog.y, input) : 0
  const cogWeight = COG_WEIGHT

  const tidy = tidinessOf(placements, input, gapOf(input))
  const score =
    100 * (unplacedTypes.length + tooBig.reduce((s, u) => s + u.count, 0)) +
    (input.objective === 'height'
      ? height / h0
      : 3 * (1 - floorCoverage) + 0.3 * (height / h0)) +
    cogWeight * cogError +
    0.3 * towerPenalty(placements, input, h0) +
    0.05 * (cog ? cog.z / h0 : 0) +
    // 見た目の整い: 使う見る点ごとの足りなさ（0〜1）の合計に、重視する度合いを掛ける
    (input.tidy.weight / 100) * TIDY_SCALE * tidy.penalty

  const counts = new Map<number, number>()
  for (const type of unplacedTypes)
    counts.set(type, (counts.get(type) ?? 0) + 1)

  return {
    placements,
    unplaced: [
      ...tooBig,
      ...[...counts].map(([type, count]) => ({
        type,
        count,
        reason: 'support' as const,
      })),
    ],
    height,
    fillRate: height > 0 ? boxVolume / (X * Y * height) : 0,
    floorCoverage,
    cog,
    tidiness: tidy.value,
    score,
    genome,
  }
}

/** 重心のずれの点数の重み */
export const COG_WEIGHT = 0.3

/**
 * 重心のずれ（床の大きさで割った値）。壁に沿う向き（その向きに壁がない、または両側に壁がある）は床の中央からのずれ。
 * 壁に垂直な向き（奥の壁・片側だけの横の壁）は、壁からの距離に寄せる強さ（0〜1）を掛けたもの（壁に近いほど良い）。
 * GPU の見積もり（box-packing-gpu.ts）でも使う
 */
export function cogErrorOf(x: number, y: number, input: PackInput) {
  const { floorX: X, floorY: Y, walls } = input
  const bias = input.wallBias / 100
  const ex =
    walls.left === walls.right
      ? (x - X / 2) / X
      : (walls.left ? x / X : (X - x) / X) * bias
  const ey = walls.back ? ((Y - y) / Y) * bias : (y - Y / 2) / Y
  return Math.hypot(ex, ey)
}

/** 置き場所から見た目の整い（0〜1）を測る。保存した結果を今の測り方で測り直すのに使う */
export function measureTidiness(placements: Placement[], input: PackInput) {
  return tidinessOf(placements, input, gapOf(input)).value
}

/** 見た目の整いの点数の重み（重視する度合いが 100 のとき、見る点 1 つが全部だめなら高さの h0 の 0.3 倍ぶん） */
const TIDY_SCALE = 0.3

const gapOf = (input: PackInput) => input.gap

/**
 * 見た目の整い。見る点ごとに 0〜1（1 が良い）で測り、使う見る点の平均（value）と、足りなさの合計（penalty）を返す
 * - group: 箱どうしが接している面のうち、同じ種類（タグ）の箱どうしが接している割合
 * - flat: 箱が置かれている範囲（外側を囲んだ四角）で、上の面の高さのばらつきの小ささ。空いたところは高さ 0 として数える
 * - bigBottom: 箱が箱の上に載っている面積のうち、下の箱より大きい箱が載っていない割合
 * - upright: 横倒しにしていない箱の割合
 * - even: 上から見て、くぼみや飛び出しになっている場所が少ないほど 1 に近い（unevenShare）
 */
function tidinessOf(placements: Placement[], input: PackInput, gap: number) {
  const n = placements.length
  if (n === 0) return { value: 1, penalty: 0 }
  const name = (t: number) => input.boxes[t]?.tag.trim() || `#${t}`
  const { floorX: X, floorY: Y, walls } = input
  // リストでの並び順（置いた箱の種類の中での順番を 0〜1 にそろえる）
  const present = [...new Set(placements.map((p) => p.type))].sort(
    (a, b) => a - b,
  )
  const rankOf = new Map(
    present.map((t, i) => [t, i / Math.max(1, present.length - 1)]),
  )
  // 壁からの距離（奥の壁・片側だけの横の壁。両方あれば近いほう）
  const wallDist = (p: Placement) => {
    let d = Number.POSITIVE_INFINITY
    if (walls.back) d = Math.min(d, Y - (p.y + p.d / 2))
    if (walls.left && !walls.right) d = Math.min(d, p.x + p.w / 2)
    if (walls.right && !walls.left) d = Math.min(d, X - (p.x + p.w / 2))
    return d
  }
  const hasWall = walls.back || walls.left !== walls.right
  let contactAll = 0
  let contactSame = 0
  let supportAll = 0
  let supportBad = 0
  let nearArea = 0
  let nearSum = 0
  let wallPairs = 0
  let wallGood = 0
  for (let a = 0; a < n; a++) {
    const p = placements[a]
    for (let b = a + 1; b < n; b++) {
      const q = placements[b]
      const ox = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x)
      const oy = Math.min(p.y + p.d, q.y + q.d) - Math.max(p.y, q.y)
      const oz = Math.min(p.z + p.h, q.z + q.h) - Math.max(p.z, q.z)
      // 横に並んで接している（ちょうどすき間の分だけ離れている）
      if (oz > 0) {
        let area = 0
        if (oy > 0 && (p.x + p.w + gap === q.x || q.x + q.w + gap === p.x))
          area += oy * oz
        if (ox > 0 && (p.y + p.d + gap === q.y || q.y + q.d + gap === p.y))
          area += ox * oz
        if (area > 0) {
          contactAll += area
          if (name(p.type) === name(q.type)) contactSame += area
          nearArea += area
          nearSum +=
            area *
            Math.abs((rankOf.get(p.type) ?? 0) - (rankOf.get(q.type) ?? 0))
        }
      }
      // 上下に載っている
      if (ox > 0 && oy > 0) {
        const [lower, upper] =
          p.z + p.h === q.z ? [p, q] : q.z + q.h === p.z ? [q, p] : [null, null]
        if (lower && upper) {
          const area = ox * oy
          supportAll += area
          if (upper.w * upper.d * upper.h > lower.w * lower.d * lower.h)
            supportBad += area
        }
      }
      // 大きい箱が壁側か（体積が違う 2 つで、大きいほうが壁に近いか）
      if (hasWall) {
        const vp = p.w * p.d * p.h
        const vq = q.w * q.d * q.h
        const dp = wallDist(p)
        const dq = wallDist(q)
        if (vp !== vq && dp !== dq) {
          wallPairs++
          if (vp > vq === dp < dq) wallGood++
        }
      }
    }
  }
  // 上から見た高さの地図。箱が置かれている範囲（外側を囲んだ四角）をマス目に分け、
  // 各マスの中心でいちばん高い上面を調べる。箱のないマスは高さ 0（空いたところ）。
  // 箱は少し広げて塗るので、決めたすき間ほどの細いすき間は埋まって見える
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = 0
  let maxY = 0
  for (const p of placements) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + p.w)
    maxY = Math.max(maxY, p.y + p.d)
  }
  const cell = Math.max(10, Math.max(maxX - minX, maxY - minY) / 48)
  const GX = Math.max(1, Math.round((maxX - minX) / cell))
  const GY = Math.max(1, Math.round((maxY - minY) / cell))
  const cw = (maxX - minX) / GX
  const ch = (maxY - minY) / GY
  const tops = new Float64Array(GX * GY)
  const spread = gap + 10
  const cells = (
    from: number,
    size: number,
    min: number,
    step: number,
    g: number,
  ) => [
    Math.max(0, Math.ceil((from - spread - min) / step - 0.5)),
    Math.min(g - 1, Math.ceil((from + size + spread - min) / step - 0.5) - 1),
  ]
  for (const p of placements) {
    const [i0, i1] = cells(p.x, p.w, minX, cw, GX)
    const [j0, j1] = cells(p.y, p.d, minY, ch, GY)
    const top = p.z + p.h
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (top > tops[j * GX + i]) tops[j * GX + i] = top
      }
    }
  }
  let maxTop = 0
  let sum = 0
  for (const t of tops) {
    maxTop = Math.max(maxTop, t)
    sum += t
  }
  const mean = sum / tops.length
  let varSum = 0
  for (const t of tops) varSum += (t - mean) ** 2
  const std = Math.sqrt(varSum / tops.length)
  const parts: number[] = []
  if (input.tidy.group)
    parts.push(contactAll > 0 ? contactSame / contactAll : 1)
  if (input.tidy.flat)
    parts.push(maxTop > 0 ? Math.max(0, 1 - (2 * std) / maxTop) : 1)
  if (input.tidy.bigBottom)
    parts.push(supportAll > 0 ? 1 - supportBad / supportAll : 1)
  if (input.tidy.upright)
    parts.push(1 - placements.filter((p) => p.laidDown).length / n)
  if (input.tidy.bigWall && hasWall)
    parts.push(wallPairs > 0 ? wallGood / wallPairs : 1)
  if (input.tidy.front)
    parts.push(placements.filter((p) => p.faces[3] === '前').length / n)
  if (input.tidy.frontFlat) {
    // 横に細かく分けた列ごとに、いちばん手前の箱の前の面の位置。そのばらつきが小さいほど 1 に近い
    const fronts: number[] = []
    for (let i = 0; i < GX; i++) {
      const px = minX + (i + 0.5) * cw
      let f = Number.POSITIVE_INFINITY
      for (const p of placements)
        if (px >= p.x && px < p.x + p.w && p.y < f) f = p.y
      if (Number.isFinite(f)) fronts.push(f)
    }
    const fm = fronts.reduce((a, x) => a + x, 0) / Math.max(1, fronts.length)
    const fs = Math.sqrt(
      fronts.reduce((a, x) => a + (x - fm) ** 2, 0) /
        Math.max(1, fronts.length),
    )
    parts.push(Math.max(0, 1 - (2 * fs) / Math.max(1, maxY - minY)))
  }
  if (input.tidy.near)
    parts.push(nearArea > 0 ? Math.max(0, 1 - (2 * nearSum) / nearArea) : 1)
  if (input.tidy.balance && walls.left === walls.right) {
    // 左右を折り返して、高さの地図がどれだけ重なるか
    let diff = 0
    let total = 0
    for (let j = 0; j < GY; j++) {
      for (let i = 0; i < GX; i++) {
        const a = tops[j * GX + i]
        const b = tops[j * GX + (GX - 1 - i)]
        diff += Math.abs(a - b)
        total += a + b
      }
    }
    parts.push(total > 0 ? 1 - diff / total : 1)
  }
  if (input.tidy.even) {
    parts.push(
      Math.max(
        0,
        1 - EVEN_SCALE * unevenShare(tops, GX, GY, cw, ch, placements),
      ),
    )
  }
  if (parts.length === 0) return { value: 1, penalty: 0 }
  return {
    value: parts.reduce((s, x) => s + x, 0) / parts.length,
    penalty: parts.reduce((s, x) => s + (1 - x), 0),
  }
}

/** くぼみ・飛び出しで整いをどれだけ下げるか（範囲の 5% がくぼみか飛び出しなら 0.75） */
const EVEN_SCALE = 5

const median = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

/**
 * 高さの地図のうち、くぼみか飛び出しになっているマスの割合。横の列と縦の列ごとに調べる。
 * - くぼみ: 列の両側に、それより段差以上高いところがある（雨が降ったら水がたまる場所）
 * - 飛び出し: 列の両側の近くに、それより段差以上低いところがある（細い塔）
 * 段差は置いた箱の高さの中央値の半分（20mm 以上）、近くは置いた箱の長い辺の中央値。
 * 端の列が低いだけ（奥の壁側が高い段々など）は、片側にしか高いところがないので数えない
 */
function unevenShare(
  tops: Float64Array,
  GX: number,
  GY: number,
  cw: number,
  ch: number,
  placements: Placement[],
) {
  const step = Math.max(20, median(placements.map((p) => p.h)) / 2)
  const reach = median(placements.map((p) => Math.max(p.w, p.d)))
  const bad = new Uint8Array(GX * GY)
  const leftMax = new Float64Array(Math.max(GX, GY))
  // 1 本の列を調べる。at(k) は k 番目のマスの番号、size は 1 マスの長さ
  const line = (len: number, at: (k: number) => number, size: number) => {
    const R = Math.max(1, Math.round(reach / size))
    let m = 0
    for (let k = 0; k < len; k++) {
      leftMax[k] = m
      m = Math.max(m, tops[at(k)])
    }
    let rightMax = 0
    for (let k = len - 1; k >= 0; k--) {
      const t = tops[at(k)]
      if (Math.min(leftMax[k], rightMax) - t >= step) bad[at(k)] = 1
      else if (!bad[at(k)]) {
        let lowL = false
        let lowR = false
        for (let d = 1; d <= R && !lowL; d++)
          if (k - d >= 0 && tops[at(k - d)] <= t - step) lowL = true
        for (let d = 1; d <= R && !lowR; d++)
          if (k + d < len && tops[at(k + d)] <= t - step) lowR = true
        if (lowL && lowR) bad[at(k)] = 1
      }
      rightMax = Math.max(rightMax, t)
    }
  }
  for (let j = 0; j < GY; j++) line(GX, (k) => j * GX + k, cw)
  for (let i = 0; i < GX; i++) line(GY, (k) => k * GX + i, ch)
  let count = 0
  for (const b of bad) count += b
  return count / bad.length
}

/**
 * ぽつんと高い塔の度合い。床をマス目に分けて、各マスのいちばん高い上面を調べる。
 * - まわりのマスより飛び抜けて高いところ
 * - 壁があるときは、壁側のとなりのマスより高いところ（壁側が高く、離れるほど低いのが良い）
 */
function towerPenalty(placements: Placement[], input: PackInput, h0: number) {
  const G = 16
  const { floorX: X, floorY: Y, walls } = input
  const heights = new Float64Array(G * G)
  for (let i = 0; i < G; i++) {
    for (let j = 0; j < G; j++) {
      const px = ((i + 0.5) * X) / G
      const py = ((j + 0.5) * Y) / G
      let top = 0
      for (const p of placements) {
        if (px >= p.x && px < p.x + p.w && py >= p.y && py < p.y + p.d) {
          top = Math.max(top, p.z + p.h)
        }
      }
      heights[i * G + j] = top
    }
  }
  const at = (i: number, j: number) => heights[i * G + j]
  let spike = 0
  let towardWall = 0
  for (let i = 0; i < G; i++) {
    for (let j = 0; j < G; j++) {
      const h = at(i, j)
      if (h === 0) continue
      const around: number[] = []
      if (i > 0) around.push(at(i - 1, j))
      if (i < G - 1) around.push(at(i + 1, j))
      if (j > 0) around.push(at(i, j - 1))
      if (j < G - 1) around.push(at(i, j + 1))
      const mean = around.reduce((s, x) => s + x, 0) / around.length
      spike += Math.max(0, h - mean)
      if (walls.back && j < G - 1) towardWall += Math.max(0, h - at(i, j + 1))
      if (walls.left && !walls.right && i > 0)
        towardWall += Math.max(0, h - at(i - 1, j))
      if (walls.right && !walls.left && i < G - 1)
        towardWall += Math.max(0, h - at(i + 1, j))
    }
  }
  return (0.5 * spike + towardWall) / (G * G * h0)
}

// ---- 並べ順を変えながら探す ----

/** 同じ種なら同じ乱数の列になる */
export function random(seed: number) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 形の番号から、かたまりの箱の数 */
const sizeOfCode = (code: number) => {
  const r = code % 64
  return (
    (Math.floor(r / 16) + 1) * ((Math.floor(r / 4) % 4) + 1) * ((r % 4) + 1)
  )
}

/**
 * 形の番号の列を、置く単位の番号の列に直す。
 * 合わない分（設定が違って作れない形・数の過不足）は、ばらの箱で直す
 */
export function unitIdsOf(seq: readonly number[], table: UnitTable) {
  const need = table.groups.map((g) => g.members.length)
  const out: number[] = []
  const pushSingles = (group: number, count: number) => {
    for (let i = 0; i < count && need[group] > 0; i++) {
      out.push(table.single[group])
      need[group]--
    }
  }
  for (const code of seq) {
    const group = Math.floor(code / 64)
    if (group >= table.groups.length) continue
    const id = table.byCode.get(code)
    if (id === undefined) {
      pushSingles(group, sizeOfCode(code))
      continue
    }
    const u = table.units[id]
    if (u.size <= need[group]) {
      out.push(id)
      need[group] -= u.size
    } else pushSingles(group, need[group])
  }
  need.forEach((n, g) => {
    pushSingles(g, n)
  })
  return out
}

/** ルールの長さと範囲をそろえる */
function normalizeRule(rule: readonly number[] | undefined, input: PackInput) {
  const fallback = defaultRules(input)[0]
  return Array.from({ length: RULE_SIZE }, (_, i) => {
    const e = rule?.[i]
    return typeof e === 'number' && Number.isFinite(e)
      ? Math.max(0, Math.min(RULE_MAX, Math.round(e)))
      : fallback[i]
  })
}

/** 箱の種類の列（前の版の並べ順）を、ばらの箱の単位の番号の列に直す */
function idsFromTypes(types: readonly number[], table: UnitTable) {
  const groupOfType = new Map<number, number>()
  table.groups.forEach((g, gi) => {
    for (const t of g.members) groupOfType.set(t, gi)
  })
  const seq: number[] = []
  for (const t of types) {
    const g = groupOfType.get(t)
    if (g !== undefined) seq.push(codeOf(g, 1, 1, 1))
  }
  return unitIdsOf(seq, table)
}

/** 置く単位の番号の列とルールを、結果に付ける遺伝子にする */
const genomeOf = (ids: readonly number[], rule: Rule, table: UnitTable) => ({
  seq: ids.map((id) => table.units[id].code),
  rule: [...rule],
})

/** 遺伝子を、置く単位の番号の列とルールに直す（前の版の並べ順 startOrder にも対応） */
export function decodeStart(
  input: PackInput,
  table: UnitTable,
): { ids: number[]; rule: Rule } | null {
  if (input.startGenome && input.startGenome.seq.length > 0) {
    return {
      ids: unitIdsOf(input.startGenome.seq, table),
      rule: normalizeRule(input.startGenome.rule, input),
    }
  }
  if (input.startOrder && input.startOrder.length > 0) {
    return {
      ids: idsFromTypes(input.startOrder, table),
      rule: defaultRules(input)[0],
    }
  }
  return null
}

/** 置く単位の番号の列とルールで置いて、正式に評価する */
export function evaluateIds(
  input: PackInput,
  table: UnitTable,
  ids: readonly number[],
  rule: Rule,
): PackResult {
  const trace = packInOrder(ids, rule.map(weightOf), input, table)
  return finish(trace, input, table, genomeOf(ids, rule, table))
}

/** 遺伝子を正式に評価する */
export function evaluateGenome(input: PackInput, genome: Genome): PackResult {
  const table = unitsOf(input)
  return evaluateIds(
    input,
    table,
    unitIdsOf(genome.seq, table),
    normalizeRule(genome.rule, input),
  )
}

/** かたまりの中の箱どうしの横の接触面積と、箱 1 個の体積（GPU で見た目の整いを見積もるのに使う） */
export function unitExtras(table: UnitTable, unitId: number, oi: number) {
  const u = table.units[unitId]
  const bo = table.groups[u.group].orientations[u.base[oi]]
  return {
    internal:
      (u.a - 1) * u.b * u.c * bo.d * bo.h + u.a * (u.b - 1) * u.c * bo.w * bo.h,
    boxVolume: bo.w * bo.d * bo.h,
  }
}

/**
 * 並べ方を 1 つ積んだ記録（置き始める角を原点にした座標）。GPU の計算で、
 * 入れ替えた位置より前の置き方をここから写して、そこから先だけを計算するのに使う
 */
export function traceIds(
  input: PackInput,
  table: UnitTable,
  ids: readonly number[],
  rule: Rule,
) {
  const t = packInOrder(ids, rule.map(weightOf), input, table)
  return {
    placed: t.placed.map((p) => {
      const x = unitExtras(table, p.unit, p.oi)
      return [
        p.u,
        p.v,
        p.z,
        p.w,
        p.d,
        p.h,
        p.group,
        p.size + (p.laidDown ? 256 : 0),
        x.internal,
        x.boxVolume,
        p.rank,
        p.frontOK ? 1 : 0,
      ] as const
    }),
    placedAfter: t.placedAfter,
    heightAfter: t.heightAfter,
  }
}

/** 置き始める角の向き（GPU の計算でも同じ決め方を使う） */
export function alongSideFirstOf(walls: Walls) {
  return anchorOf(walls).alongSideFirst
}

/** 置き始める角（GPU の計算で、壁がどちら側かを知るのに使う） */
export function wallSidesOf(walls: Walls) {
  return {
    /** 置き始める角を原点にしたとき、v の小さい側に壁がある */
    wallV: walls.back,
    /** u の小さい側に壁がある（左右の片方だけに壁があるとき） */
    wallU: walls.left !== walls.right,
  }
}

/** 最初に試す並べ方（ばらの箱をいろいろな順に・できるだけ大きなかたまりにして、ルールもいくつか） */
export function startPlans(input: PackInput, table: UnitTable) {
  const rules = defaultRules(input)
  const dims = (g: number) => table.groups[g].orientations[0]
  const area = (g: number) => dims(g).w * dims(g).d
  const tall = (g: number) => dims(g).h
  const long = (g: number) => Math.max(dims(g).w, dims(g).d, dims(g).h)
  const singles: number[] = []
  table.groups.forEach((g, gi) => {
    for (let i = 0; i < g.members.length; i++) singles.push(gi)
  })
  const sorts = [
    (a: number, b: number) => area(b) - area(a) || tall(b) - tall(a),
    (a: number, b: number) => area(b) * tall(b) - area(a) * tall(a),
    (a: number, b: number) => tall(b) - tall(a) || area(b) - area(a),
    (a: number, b: number) => long(b) - long(a) || area(b) - area(a),
    (a: number, b: number) => tall(a) - tall(b) || area(b) - area(a),
  ]
  const singleOrders = sorts.map((sort) =>
    [...singles]
      .sort((a, b) => sort(a, b) || a - b)
      .map((g) => table.single[g]),
  )
  // できるだけ大きなかたまりにする（同じ大きさなら段の少ない平たい形）。底面が大きい順に並べる
  const blocks: number[] = []
  table.groups.forEach((g, gi) => {
    let left = g.members.length
    const shapes = table.units
      .map((u, id) => ({ u, id }))
      .filter((x) => x.u.group === gi)
      .sort((x, y) => y.u.size - x.u.size || x.u.c - y.u.c)
    while (left > 0) {
      const s = shapes.find((x) => x.u.size <= left)
      if (!s) break
      blocks.push(s.id)
      left -= s.u.size
    }
  })
  const footprint = (id: number) => {
    const o = table.units[id].orientations[0]
    return o.w * o.d
  }
  blocks.sort(
    (a, b) =>
      footprint(b) - footprint(a) ||
      table.units[b].orientations[0].h - table.units[a].orientations[0].h,
  )
  const plans: { ids: number[]; rule: Rule }[] = []
  const first = decodeStart(input, table)
  if (first) plans.push(first)
  plans.push({ ids: singleOrders[0], rule: rules[0] })
  plans.push({ ids: blocks, rule: rules[1] })
  plans.push({ ids: blocks, rule: rules[0] })
  plans.push({ ids: singleOrders[0], rule: rules[1] })
  plans.push({ ids: blocks, rule: rules[2] })
  for (const ids of singleOrders.slice(1)) plans.push({ ids, rule: rules[0] })
  return plans
}

/**
 * 並べ方を少し崩す（CPU の係と GPU の係で同じ崩し方を使う）。
 * 並べ順の入れ替え・1 つを別の位置へ・区間を逆順に・ルールの重みを変える（2 つの重みを入れ替えると優先する順が変わる）・
 * かたまりを分ける・2 つのかたまりをつなぐ・2 つの良い並べ方の組み合わせ。
 * start は、元の並べ方と初めて違う位置（ルールが変わったら 0。何も変わらなければ並べ順の長さ）
 */
export function mutate(
  ids: readonly number[],
  rule: Rule,
  rand: () => number,
  table: UnitTable,
  other?: readonly number[],
) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const o = [...ids]
    let r = [...rule]
    const m = o.length
    const kind = rand()
    if (m < 2 && kind < 0.62) continue
    if (kind < 0.4) {
      // 2 つの入れ替え（1〜3 回。近くと入れ替えることが多いほうが、良い並びを壊しにくい）
      const swaps = 1 + Math.floor(rand() * 3)
      for (let s = 0; s < swaps; s++) {
        const i = Math.floor(rand() * m)
        const reach = rand() < 0.7 ? 4 : m
        const j = Math.min(
          m - 1,
          Math.max(0, i + Math.floor((rand() * 2 - 1) * reach)),
        )
        const t = o[i]
        o[i] = o[j]
        o[j] = t
      }
    } else if (kind < 0.55) {
      // 1 つを抜いて、別の位置に入れる
      const i = Math.floor(rand() * m)
      const reach = rand() < 0.7 ? 6 : m
      const j = Math.min(
        m - 1,
        Math.max(0, i + Math.floor((rand() * 2 - 1) * reach)),
      )
      const [v] = o.splice(i, 1)
      o.splice(j, 0, v)
    } else if (kind < 0.62) {
      // 一続きの区間を逆順にする
      const len = 2 + Math.floor(rand() * Math.max(1, Math.floor(m / 4) - 1))
      const i = Math.floor(rand() * Math.max(1, m - len + 1))
      const part = o.slice(i, i + len).reverse()
      o.splice(i, part.length, ...part)
    } else if (kind < 0.76) {
      // ルールを変える: 1 つの重みを上げ下げするか、2 つの重みを入れ替える（優先する順が変わる）
      r = [...rule]
      if (rand() < 0.5) {
        const k = Math.floor(rand() * RULE_SIZE)
        const step = (rand() < 0.5 ? -1 : 1) * (rand() < 0.7 ? 1 : 2)
        r[k] = Math.max(0, Math.min(RULE_MAX, r[k] + step))
      } else {
        const a = Math.floor(rand() * RULE_SIZE)
        const b = Math.floor(rand() * RULE_SIZE)
        const t = r[a]
        r[a] = r[b]
        r[b] = t
      }
    } else if (kind < 0.84) {
      // かたまりを 2 つに分ける
      const big = o.map((_, i) => i).filter((i) => table.units[o[i]].size > 1)
      if (big.length === 0) continue
      const i = big[Math.floor(rand() * big.length)]
      const u = table.units[o[i]]
      const dims = [u.a, u.b, u.c]
      const axes = [0, 1, 2].filter((x) => dims[x] > 1)
      const ax = axes[Math.floor(rand() * axes.length)]
      const s = 1 + Math.floor(rand() * (dims[ax] - 1))
      const p = [...dims]
      const q = [...dims]
      p[ax] = s
      q[ax] = dims[ax] - s
      const ip = unitAt(table, u.group, p[0], p[1], p[2])
      const iq = unitAt(table, u.group, q[0], q[1], q[2])
      if (ip !== undefined && iq !== undefined) o.splice(i, 1, ip, iq)
      else o.splice(i, 1, ...new Array(u.size).fill(table.single[u.group]))
    } else if (kind < 0.92 || !other) {
      // 同じ寸法の 2 つをつないで、1 つのかたまりにする
      const i = Math.floor(rand() * m)
      const u = table.units[o[i]]
      let done = false
      for (let t = 0; t < 10 && !done; t++) {
        const j = Math.floor(rand() * m)
        if (j === i) continue
        const w = table.units[o[j]]
        if (w.group !== u.group) continue
        const tries: number[][] = []
        if (u.b === w.b && u.c === w.c) tries.push([u.a + w.a, u.b, u.c])
        if (u.a === w.a && u.c === w.c) tries.push([u.a, u.b + w.b, u.c])
        if (u.a === w.a && u.b === w.b) tries.push([u.a, u.b, u.c + w.c])
        while (tries.length > 0 && !done) {
          const [x] = tries.splice(Math.floor(rand() * tries.length), 1)
          const id = unitAt(table, u.group, x[0], x[1], x[2])
          if (id === undefined) continue
          const lo = Math.min(i, j)
          const hi = Math.max(i, j)
          o.splice(hi, 1)
          o[lo] = id
          done = true
        }
      }
      if (!done) continue
    } else {
      // 2 つの良い並べ方の組み合わせ: 前半はそのまま、残りはもう片方の順番に並べる
      const c = 1 + Math.floor(rand() * Math.max(1, m - 1))
      const rest = new Map<number, number>()
      for (let q = c; q < m; q++) rest.set(o[q], (rest.get(o[q]) ?? 0) + 1)
      const tail: number[] = []
      for (const id of other) {
        const n = rest.get(id) ?? 0
        if (n > 0) {
          rest.set(id, n - 1)
          tail.push(id)
        }
      }
      for (let q = c; q < m; q++) {
        const n = rest.get(o[q]) ?? 0
        if (n > 0) {
          rest.set(o[q], n - 1)
          tail.push(o[q])
        }
      }
      o.splice(c, m - c, ...tail)
    }
    const ruleChanged = r.some((x, i) => x !== rule[i])
    let start = 0
    if (!ruleChanged) {
      const len = Math.min(o.length, ids.length)
      while (start < len && o[start] === ids[start]) start++
      if (start === len && o.length === ids.length) continue
    }
    return { ids: o, rule: r, start }
  }
  return { ids: [...ids], rule: [...rule], start: ids.length }
}

export function createSearch(
  input: PackInput,
  /** 評価したすべての結果を受け取る（部門別のいちばんを見張るため） */
  onResult?: (result: PackResult) => void,
) {
  const table = unitsOf(input)
  const plans = startPlans(input, table)
  let bestIds = plans[0].ids
  let bestRule = plans[0].rule
  let bestTrace = packInOrder(bestIds, bestRule.map(weightOf), input, table)
  let best = finish(bestTrace, input, table, genomeOf(bestIds, bestRule, table))
  onResult?.(best)
  let tried = 1
  const rand = random(input.seed * 7919 + table.boxCount)

  return {
    get best() {
      return best
    },
    get tried() {
      return tried
    },
    /** これ以上試しても変わらない（箱が 1 個以下で、最初の並べ方も試し終えた） */
    get exhausted() {
      return tried >= plans.length && table.boxCount <= 1
    },
    step() {
      let ids: number[]
      let rule: Rule
      let trace: Trace
      if (tried < plans.length) {
        ids = plans[tried].ids
        rule = plans[tried].rule
        tried++
        trace = packInOrder(ids, rule.map(weightOf), input, table)
      } else {
        const next = mutate(bestIds, bestRule, rand, table)
        tried++
        if (next.start >= next.ids.length && next.ids.length === bestIds.length)
          return false
        ids = next.ids
        rule = next.rule
        // 今いちばん良い並べ方と同じところまでは、置き方も同じになるので置き直さない
        trace =
          next.start > 0
            ? packInOrder(
                ids,
                rule.map(weightOf),
                input,
                table,
                bestTrace,
                next.start,
              )
            : packInOrder(ids, rule.map(weightOf), input, table)
      }
      const result = finish(trace, input, table, genomeOf(ids, rule, table))
      onResult?.(result)
      if (result.score < best.score - 1e-9) {
        best = result
        bestIds = ids
        bestRule = rule
        bestTrace = trace
        return true
      }
      // 同じ点数なら並べ方だけ乗り換える（行き詰まりにくくする）
      if (result.score <= best.score) {
        bestIds = ids
        bestRule = rule
        bestTrace = trace
      }
      return false
    },
  }
}

// ---- 部門別のいちばん ----

/**
 * 人が見比べて選ぶための部門。
 * 同じ床と箱で全部置けた結果どうしなら、充填率は高さだけで決まるので部門にしない
 */
export type Metric = 'height' | 'low' | 'tidy'

export const metricLabels: Record<Metric, string> = {
  height: 'いちばん低い',
  low: '重心がいちばん低い',
  tidy: '見た目がいちばん整っている',
}

export const metrics = Object.keys(metricLabels) as Metric[]

/** 部門の対象になる結果か（置けなかった箱がない） */
export function isComplete(r: PackResult) {
  return r.unplaced.length === 0 && r.placements.length > 0
}

/** 「見た目がいちばん整っている」部門の対象にする高さの幅（いちばん低い結果の何倍まで） */
export const TIDY_HEIGHT_BAND = 1.1

/**
 * a が b より、その部門で良いか（b がなければ、対象になる結果なら良い）。
 * lowest は、今わかっているいちばん低い高さ。「見た目がいちばん整っている」部門は、
 * いちばん低い結果より TIDY_HEIGHT_BAND 倍以内の高さのものだけで整いを比べる
 */
export function betterFor(
  metric: Metric,
  a: PackResult,
  b?: PackResult,
  lowest?: number,
) {
  if (!isComplete(a)) return false
  if (!b) return true
  if (metric === 'tidy') {
    const low = Math.min(lowest ?? Number.POSITIVE_INFINITY, a.height, b.height)
    const inA = a.height <= low * TIDY_HEIGHT_BAND + 1e-6
    const inB = b.height <= low * TIDY_HEIGHT_BAND + 1e-6
    if (inA !== inB) return inA
    if (!inA) return a.height < b.height
  }
  const cogZ = (r: PackResult) => r.cog?.z ?? 0
  const keys: Record<Metric, (r: PackResult) => number[]> = {
    // 高さが同じ結果はたくさんあるので、同じなら見た目が整っているほうを残す
    height: (r) => [r.height, -r.tidiness, -r.floorCoverage, cogZ(r)],
    low: (r) => [cogZ(r), r.height, -r.floorCoverage],
    tidy: (r) => [-r.tidiness, r.height, cogZ(r)],
  }
  const ka = keys[metric](a)
  const kb = keys[metric](b)
  for (let i = 0; i < ka.length; i++) {
    if (Math.abs(ka[i] - kb[i]) > 1e-6) return ka[i] < kb[i]
  }
  return false
}
