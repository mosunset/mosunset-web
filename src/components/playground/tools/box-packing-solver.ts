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
  /** 並べ順を入れ替えるときの乱数の種 */
  seed: number
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
  /** 小さいほど良い */
  score: number
}

// ---- 箱の向き ----

type Orientation = {
  w: number
  d: number
  h: number
  faces: FaceLabel[]
  laidDown: boolean
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
export function orientationsOf(box: BoxSpec): Orientation[] {
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
      if (seen.has(key)) continue
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

// ---- 1 つの並べ順で置いていく ----

type Item = { type: number; orientations: Orientation[]; volume: number }

/** 小さい順に比べる（先の要素ほど大事） */
function compare(a: number[], b: number[]) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

/** 置いた箱（u・v は、置き始める角を原点にした座標） */
type Placed = Orientation & { type: number; u: number; v: number; z: number }

/**
 * 置き始める角。奥に壁があれば奥から、右の壁だけなら右から詰める。
 * 壁がない向きは、あとで全体を床の中央へ動かす
 */
function anchorOf(walls: Walls) {
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
 * 1 つの並べ順で置いた記録。置いた箱は後ろに足していくだけなので、
 * 「i 番目まで置いた時点」の状態は、各時点の個数を覚えておけば取り出せる
 */
type Trace = {
  placed: Placed[]
  unplaced: number[]
  height: number
  /** 並べ順の i 番目を置き終えた時点での、置いた数・置けなかった数・高さ */
  placedAfter: number[]
  unplacedAfter: number[]
  heightAfter: number[]
}

/**
 * 並べ順のとおりに 1 個ずつ置いていく。
 * base と from を渡すと、base の並べ順と from 番目より前が同じとみなし、そこから先だけを置き直す
 */
function packInOrder(
  order: Item[],
  input: PackInput,
  base?: Trace,
  from = 0,
): Trace {
  const { gap, objective } = input
  const U = input.floorX - 2 * input.edgeGap
  const V = input.floorY - 2 * input.edgeGap
  const anchor = anchorOf(input.walls)
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
  const sides = order.map((it) =>
    Math.min(it.orientations[0].w, it.orientations[0].d),
  )
  const grid = new Grid(
    U,
    V,
    order.length,
    sides.reduce((a, b) => a + b, 0) / Math.max(1, sides.length),
  )
  /** 置いた箱の番号（箱が少ないうちは、マス目を使わずに全部を調べる） */
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
    const item = order[index]
    let best: { score: number[]; p: Placed } | null = null
    const candidates: Iterable<[number, number]> =
      us.size * vs.size <= 2500
        ? (function* () {
            for (const u of us)
              for (const v of vs) yield [u, v] as [number, number]
          })()
        : points

    for (const [u, v] of candidates) {
      for (const o of item.orientations) {
        if (u + o.w > U || v + o.d > V) continue
        // 床に直接置けたとしても今の最良に勝てない場所は、調べるまでもない
        const along = anchor.alongSideFirst ? [u, v] : [v, u]
        const scoreAt = (z: number) =>
          objective === 'height'
            ? [Math.max(height, z + o.h), z + o.h, z, ...along]
            : [z, z + o.h, ...along]
        if (best && compare(scoreAt(0), best.score) >= 0) continue
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
        // 置ける高さが決まった時点で勝てないなら、すき間や支えは確かめない
        const score = scoreAt(z)
        if (best && compare(score, best.score) >= 0) continue

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

        // 底面がどれだけ支えられているか（ちょうど z の高さに上面がある箱との重なり）
        if (z > 0) {
          let supported = 0
          for (const id of near) {
            const b = placed[id]
            if (b.z + b.h !== z) continue
            const ou = Math.min(u + o.w, b.u + b.w) - Math.max(u, b.u)
            const ov = Math.min(v + o.d, b.v + b.d) - Math.max(v, b.v)
            if (ou > 0 && ov > 0) supported += ou * ov
          }
          if (supported * 100 < input.supportPercent * o.w * o.d) continue
        }

        best = { score, p: { ...o, type: item.type, u, v, z } }
      }
    }

    if (best) {
      placed.push(best.p)
      register(best.p, placed.length - 1)
      height = Math.max(height, best.p.z + best.p.h)
    } else {
      unplaced.push(item.type)
    }
    placedAfter.push(placed.length)
    unplacedAfter.push(unplaced.length)
    heightAfter.push(height)
  }

  return { placed, unplaced, height, placedAfter, unplacedAfter, heightAfter }
}

// ---- 結果を床の座標に直して、評価する ----

function finish(
  packed: ReturnType<typeof packInOrder>,
  input: PackInput,
  tooBig: Unplaced[],
): PackResult {
  const { floorX: X, floorY: Y, edgeGap: e, walls } = input
  const anchor = anchorOf(walls)
  let placements: Placement[] = packed.placed.map((p) => ({
    type: p.type,
    x: anchor.fromRight ? X - e - p.u - p.w : e + p.u,
    y: anchor.fromBack ? Y - e - p.v - p.d : e + p.v,
    z: p.z,
    w: p.w,
    d: p.d,
    h: p.h,
    faces: p.faces,
    laidDown: p.laidDown,
  }))

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

  // 重心のずれ: 壁がなければ床の中心、壁があれば壁側に少し寄せた点を目標にする
  const offset = (input.wallBias / 100) * 0.25
  const tx =
    X / 2 +
    (walls.left === walls.right ? 0 : walls.left ? -offset * X : offset * X)
  const ty = Y / 2 + (walls.back ? offset * Y : 0)
  const cogError = cog ? Math.hypot((cog.x - tx) / X, (cog.y - ty) / Y) : 0
  const hasWall = walls.back || walls.left || walls.right
  const cogWeight = hasWall ? 0.15 + 0.35 * (input.wallBias / 100) : 0.3

  const score =
    100 * (packed.unplaced.length + tooBig.reduce((s, u) => s + u.count, 0)) +
    (input.objective === 'height'
      ? height / h0
      : 3 * (1 - floorCoverage) + 0.3 * (height / h0)) +
    cogWeight * cogError +
    0.3 * towerPenalty(placements, input, h0) +
    0.05 * (cog ? cog.z / h0 : 0)

  const counts = new Map<number, number>()
  for (const type of packed.unplaced)
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
    score,
  }
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

/**
 * 探索を 1 歩ずつ進める。step() は、より良い結果が見つかったら true を返す。
 * まず「大きい箱から」などのよく効く並べ順を試し、そのあとは今いちばん良い並べ順を少しずつ入れ替える
 */
export function createSearch(input: PackInput) {
  const items: Item[] = []
  const tooBig: Unplaced[] = []
  input.boxes.forEach((box, type) => {
    if (box.count <= 0) return
    if (!fitsFloor(box, input)) {
      tooBig.push({ type, count: box.count, reason: 'too-big' })
      return
    }
    const orientations = orientationsOf(box)
    for (let i = 0; i < box.count; i++) {
      items.push({ type, orientations, volume: box.x * box.y * box.z })
    }
  })

  const box = (it: Item) => input.boxes[it.type]
  const area = (it: Item) => box(it).x * box(it).y
  const tall = (it: Item) => box(it).z
  const long = (it: Item) => Math.max(box(it).x, box(it).y, box(it).z)
  const startOrders = [
    (a: Item, b: Item) => area(b) - area(a) || tall(b) - tall(a),
    (a: Item, b: Item) => b.volume - a.volume,
    (a: Item, b: Item) => tall(b) - tall(a) || area(b) - area(a),
    (a: Item, b: Item) => long(b) - long(a) || area(b) - area(a),
    (a: Item, b: Item) => tall(a) - tall(b) || area(b) - area(a),
  ].map((sort) => [...items].sort((a, b) => sort(a, b) || a.type - b.type))

  let bestOrder = startOrders[0]
  let bestTrace = packInOrder(bestOrder, input)
  let best = finish(bestTrace, input, tooBig)
  let tried = 1
  const rand = random(input.seed * 7919 + items.length)
  const typeCount = new Set(items.map((it) => it.type)).size

  return {
    get best() {
      return best
    },
    get tried() {
      return tried
    },
    /** これ以上試しても変わらない（箱が 1 種類以下で、最初の並べ順も試し終えた） */
    get exhausted() {
      return tried >= startOrders.length && typeCount <= 1
    },
    step() {
      let order: Item[]
      if (tried < startOrders.length) {
        order = startOrders[tried]
      } else {
        order = [...bestOrder]
        const swaps = 1 + Math.floor(rand() * 3)
        for (let s = 0; s < swaps; s++) {
          const i = Math.floor(rand() * order.length)
          // 近くの箱と入れ替えることが多いほうが、良い並びを壊しにくい
          const reach = rand() < 0.7 ? 4 : order.length
          const j = Math.min(
            order.length - 1,
            Math.max(0, i + Math.floor((rand() * 2 - 1) * reach)),
          )
          ;[order[i], order[j]] = [order[j], order[i]]
        }
      }
      tried++
      // 今いちばん良い並べ順と同じところまでは、置き方も同じになるので置き直さない
      // （同じ種類の箱どうしの入れ替えは、並べ順が変わらないのと同じ）
      let from = 0
      while (from < order.length && order[from].type === bestOrder[from].type)
        from++
      if (from === order.length) return false
      const trace = packInOrder(order, input, bestTrace, from)
      const result = finish(trace, input, tooBig)
      if (result.score < best.score - 1e-9) {
        best = result
        bestOrder = order
        bestTrace = trace
        return true
      }
      // 同じ点数なら並べ順だけ乗り換える（行き詰まりにくくする）
      if (result.score <= best.score) {
        bestOrder = order
        bestTrace = trace
      }
      return false
    },
  }
}
