/**
 * 射影変換（＋辺のうねり）の計算。
 *
 * 四隅だけなら、出力の長方形 (u, v) ∈ [0, 1]² を写真の四角形へ移すホモグラフィー H で済む。
 * 辺がベジエ曲線で少し曲がっているときは、曲がった分を「H で長方形に戻した空間」での
 * ずれ e として測り、4 本の辺のずれを Coons パッチの形で内側へなめらかに混ぜてから H をかける。
 *
 *   写真の点 = H( (u, v) + (1 - v)·e上(u) + v·e下(u) + (1 - u)·e左(v) + u·e右(v) )
 *
 * 四隅ではずれが 0 なので、辺の上ではちょうどベジエ曲線の上に乗る。
 * ずれを H の手前（長方形の側）で混ぜるので、遠くの辺ほど小さく見える遠近の縮みも保たれる。
 */

export type Pt = { x: number; y: number }

/** 四隅（左上・右上・右下・左下の順）と、辺ごとのベジエの持ち手 */
export type Quad = {
  corners: [Pt, Pt, Pt, Pt]
  /**
   * 辺 i は corners[i] → corners[i + 1]（0: 上、1: 右、2: 下（右→左）、3: 左（下→上））。
   * 持ち手は、まっすぐな辺の 1/3・2/3 の点からのずれ（写真の px）。0 ならまっすぐ
   */
  handles: [[Pt, Pt], [Pt, Pt], [Pt, Pt], [Pt, Pt]]
}

const zero = (): Pt => ({ x: 0, y: 0 })

export function straightHandles(): Quad['handles'] {
  return [
    [zero(), zero()],
    [zero(), zero()],
    [zero(), zero()],
    [zero(), zero()],
  ]
}

export function isStraight(q: Quad): boolean {
  return q.handles.every((pair) =>
    pair.every((h) => Math.abs(h.x) < 1e-9 && Math.abs(h.y) < 1e-9),
  )
}

const lerp = (a: Pt, b: Pt, t: number): Pt => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

/** 持ち手の初めの位置（まっすぐな辺の 1/3・2/3） */
export function handleBase(q: Quad, edge: number, j: 0 | 1): Pt {
  return lerp(q.corners[edge], q.corners[(edge + 1) % 4], (j + 1) / 3)
}

/** 辺 i のベジエの 4 つの制御点（curved が false なら、まっすぐ） */
export function edgeControls(
  q: Quad,
  edge: number,
  curved = true,
): [Pt, Pt, Pt, Pt] {
  const p0 = q.corners[edge]
  const p3 = q.corners[(edge + 1) % 4]
  const [h1, h2] = curved ? q.handles[edge] : [zero(), zero()]
  const b1 = lerp(p0, p3, 1 / 3)
  const b2 = lerp(p0, p3, 2 / 3)
  return [
    p0,
    { x: b1.x + h1.x, y: b1.y + h1.y },
    { x: b2.x + h2.x, y: b2.y + h2.y },
    p3,
  ]
}

export function bezier(c: readonly [Pt, Pt, Pt, Pt], t: number): Pt {
  const s = 1 - t
  const a = s * s * s
  const b = 3 * s * s * t
  const d = 3 * s * t * t
  const e = t * t * t
  return {
    x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x,
    y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y,
  }
}

export function arcLength(c: readonly [Pt, Pt, Pt, Pt], steps = 32): number {
  let len = 0
  let prev = c[0]
  for (let i = 1; i <= steps; i++) {
    const p = bezier(c, i / steps)
    len += Math.hypot(p.x - prev.x, p.y - prev.y)
    prev = p
  }
  return len
}

/** 3×3 行列（行ごと）。[a b c; d e f; g h i] */
type Mat3 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]

/** 単位正方形 (0,0)(1,0)(1,1)(0,1) を四隅へ移すホモグラフィー（Heckbert の式） */
export function squareToQuad(c: Quad['corners']): Mat3 {
  const [p0, p1, p2, p3] = c
  const dx1 = p1.x - p2.x
  const dx2 = p3.x - p2.x
  const dx3 = p0.x - p1.x + p2.x - p3.x
  const dy1 = p1.y - p2.y
  const dy2 = p3.y - p2.y
  const dy3 = p0.y - p1.y + p2.y - p3.y
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    return [
      p1.x - p0.x,
      p3.x - p0.x,
      p0.x,
      p1.y - p0.y,
      p3.y - p0.y,
      p0.y,
      0,
      0,
      1,
    ]
  }
  const den = dx1 * dy2 - dx2 * dy1
  const g = (dx3 * dy2 - dx2 * dy3) / den
  const h = (dx1 * dy3 - dx3 * dy1) / den
  return [
    p1.x - p0.x + g * p1.x,
    p3.x - p0.x + h * p3.x,
    p0.x,
    p1.y - p0.y + g * p1.y,
    p3.y - p0.y + h * p3.y,
    p0.y,
    g,
    h,
    1,
  ]
}

function invert(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null
  const k = 1 / det
  return [
    A * k,
    -(b * i - c * h) * k,
    (b * f - c * e) * k,
    B * k,
    (a * i - c * g) * k,
    -(a * f - c * d) * k,
    C * k,
    -(a * h - b * g) * k,
    (a * e - b * d) * k,
  ]
}

function apply(m: Mat3, x: number, y: number): Pt | null {
  const w = m[6] * x + m[7] * y + m[8]
  if (Math.abs(w) < 1e-12) return null
  return {
    x: (m[0] * x + m[1] * y + m[2]) / w,
    y: (m[3] * x + m[4] * y + m[5]) / w,
  }
}

/** 辺のずれの表の細かさ（間は直線でつなぐ） */
const TABLE = 512

/**
 * 1 本の辺について、H で長方形に戻した空間でのずれ e(w) の表を作る（w は辺に沿った 0〜1）。
 * at(w) は、まっすぐな辺の上の長方形の点。
 */
function displacementTable(
  H: Mat3,
  Hinv: Mat3,
  ctrl: [Pt, Pt, Pt, Pt],
  at: (w: number) => Pt,
): Float64Array {
  const out = new Float64Array((TABLE + 1) * 2)
  const p0 = ctrl[0]
  const p3 = ctrl[3]
  const dx = p3.x - p0.x
  const dy = p3.y - p0.y
  const len2 = dx * dx + dy * dy || 1
  for (let k = 0; k <= TABLE; k++) {
    const uv = at(k / TABLE)
    const p = apply(H, uv.x, uv.y)
    if (!p) continue
    // H(uv) がまっすぐな辺のどこ（0〜1）にあるかで、ベジエの同じ位置を取る
    const s = Math.min(
      1,
      Math.max(0, ((p.x - p0.x) * dx + (p.y - p0.y) * dy) / len2),
    )
    const back = apply(Hinv, ...xy(bezier(ctrl, s)))
    if (!back) continue
    const ex = back.x - uv.x
    const ey = back.y - uv.y
    // 地平線をまたぐような無理な曲げは、ずれなしにしておく
    if (!Number.isFinite(ex) || !Number.isFinite(ey)) continue
    out[k * 2] = ex
    out[k * 2 + 1] = ey
  }
  return out
}

const xy = (p: Pt): [number, number] => [p.x, p.y]

function lookup(table: Float64Array, w: number, out: Float64Array, o: number) {
  const f = Math.min(TABLE, Math.max(0, w * TABLE))
  const i = Math.min(TABLE - 1, Math.floor(f))
  const t = f - i
  out[o] = table[i * 2] + (table[i * 2 + 2] - table[i * 2]) * t
  out[o + 1] = table[i * 2 + 1] + (table[i * 2 + 3] - table[i * 2 + 1]) * t
}

/** 下の辺・左の辺は、u・v の向きにそろえるため逆向きにする */
function reversed(c: [Pt, Pt, Pt, Pt]): [Pt, Pt, Pt, Pt] {
  return [c[3], c[2], c[1], c[0]]
}

export type Mapper = {
  /** 出力の (u, v) ∈ [0, 1]² → 写真の点 */
  map: (u: number, v: number) => Pt | null
  H: Mat3
  /** 曲がった辺のずれの表（まっすぐなら null） */
  tables: {
    top: Float64Array
    bottom: Float64Array
    left: Float64Array
    right: Float64Array
  } | null
}

export function makeMapper(q: Quad, curved: boolean): Mapper | null {
  const H = squareToQuad(q.corners)
  const Hinv = invert(H)
  if (!Hinv || H.some((n) => !Number.isFinite(n))) return null
  if (!curved || isStraight(q)) {
    return { H, tables: null, map: (u, v) => apply(H, u, v) }
  }
  const tables = {
    top: displacementTable(H, Hinv, edgeControls(q, 0), (w) => ({
      x: w,
      y: 0,
    })),
    right: displacementTable(H, Hinv, edgeControls(q, 1), (w) => ({
      x: 1,
      y: w,
    })),
    bottom: displacementTable(H, Hinv, reversed(edgeControls(q, 2)), (w) => ({
      x: w,
      y: 1,
    })),
    left: displacementTable(H, Hinv, reversed(edgeControls(q, 3)), (w) => ({
      x: 0,
      y: w,
    })),
  }
  const e = new Float64Array(8)
  return {
    H,
    tables,
    map: (u, v) => {
      lookup(tables.top, u, e, 0)
      lookup(tables.bottom, u, e, 2)
      lookup(tables.left, v, e, 4)
      lookup(tables.right, v, e, 6)
      const uu = u + (1 - v) * e[0] + v * e[2] + (1 - u) * e[4] + u * e[6]
      const vv = v + (1 - v) * e[1] + v * e[3] + (1 - u) * e[5] + u * e[7]
      return apply(H, uu, vv)
    },
  }
}

/** 四角形がねじれていない（凸で、向きがそろっている）か */
export function isConvex(c: Quad['corners']): boolean {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = c[i]
    const b = c[(i + 1) % 4]
    const d = c[(i + 2) % 4]
    const cross = (b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x)
    if (Math.abs(cross) < 1e-6) return false
    const s = Math.sign(cross)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

/**
 * 写った四角形の本当の縦横比（幅 / 高さ）を、四隅から推定する。
 * Zhang & He「Whiteboard scanning and image enhancement」の方法で、
 * 写真の真ん中を光軸とみなしてカメラの焦点距離を求め、そこから比を出す。
 * 遠近がほとんどなくて焦点距離が求まらないときは、平行四辺形とみなして辺の長さで比べる
 */
export function estimateAspect(
  c: Quad['corners'],
  imageWidth: number,
  imageHeight: number,
): number {
  const u0 = imageWidth / 2
  const v0 = imageHeight / 2
  const m1 = [c[0].x, c[0].y, 1] // 左上
  const m2 = [c[1].x, c[1].y, 1] // 右上
  const m3 = [c[3].x, c[3].y, 1] // 左下
  const m4 = [c[2].x, c[2].y, 1] // 右下
  const cross = (a: number[], b: number[]) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
  const dot = (a: number[], b: number[]) =>
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const m14 = cross(m1, m4)
  const k2 = dot(m14, m3) / dot(cross(m2, m4), m3)
  const k3 = dot(m14, m2) / dot(cross(m3, m4), m2)
  const n2 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 - 1]
  const n3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 - 1]
  const affine = Math.sqrt(
    (n2[0] ** 2 + n2[1] ** 2) / (n3[0] ** 2 + n3[1] ** 2),
  )
  const zz = n2[2] * n3[2]
  let ratio = affine
  if (Math.abs(zz) > 1e-9) {
    const f2 =
      -(
        n2[0] * n3[0] -
        (n2[0] * n3[2] + n2[2] * n3[0]) * u0 +
        zz * u0 * u0 +
        (n2[1] * n3[1] - (n2[1] * n3[2] + n2[2] * n3[1]) * v0 + zz * v0 * v0)
      ) / zz
    if (f2 > 0) {
      const f = Math.sqrt(f2)
      const norm = (n: number[]) =>
        ((n[0] - u0 * n[2]) / f) ** 2 +
        ((n[1] - v0 * n[2]) / f) ** 2 +
        n[2] ** 2
      const r = Math.sqrt(norm(n2) / norm(n3))
      if (Number.isFinite(r)) ratio = r
    }
  }
  if (!Number.isFinite(ratio) || ratio < 0.05 || ratio > 20) {
    const top = Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y)
    const bottom = Math.hypot(c[2].x - c[3].x, c[2].y - c[3].y)
    const left = Math.hypot(c[3].x - c[0].x, c[3].y - c[0].y)
    const right = Math.hypot(c[2].x - c[1].x, c[2].y - c[1].y)
    ratio = (top + bottom) / (left + right) || 1
  }
  return ratio
}

/** 写真の中の四角形の面積（靴ひもの公式。曲がりは無視） */
export function quadArea(c: Quad['corners']): number {
  let s = 0
  for (let i = 0; i < 4; i++) {
    const a = c[i]
    const b = c[(i + 1) % 4]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}

export type Source = {
  data: Uint8ClampedArray
  width: number
  height: number
  /** 写真の px にかけてから、この画素を読む（縮めた写真を使うとき） */
  scale: number
}

/**
 * 出力の画像を作る。各画素の (u, v) から写真の点を求めて、双線形補間で色を読む。
 * ss は 1 画素あたり ss × ss 点を取って平均する（大きく縮めるときのギザギザ防ぎ）。
 * 写真の外は透明にする
 */
export function render(
  mapper: Mapper,
  src: Source,
  outW: number,
  outH: number,
  ss = 1,
): ImageData {
  const out = new ImageData(outW, outH)
  const o = out.data
  const { data, width: sw, height: sh, scale } = src
  const H = mapper.H
  const subW = outW * ss
  // 列ごとに決まる上下の辺のずれを先に求めておく
  const colT = new Float64Array(subW * 2)
  const colB = new Float64Array(subW * 2)
  const tables = mapper.tables
  if (tables) {
    for (let sx = 0; sx < subW; sx++) {
      const u = (sx + 0.5) / subW
      lookup(tables.top, u, colT, sx * 2)
      lookup(tables.bottom, u, colB, sx * 2)
    }
  }
  const rowE = new Float64Array(4)
  const n = ss * ss
  // 1 画素ぶんのたまり（行ごと）
  const acc = new Float64Array(outW * 4)
  for (let y = 0; y < outH; y++) {
    acc.fill(0)
    for (let j = 0; j < ss; j++) {
      const v = (y * ss + j + 0.5) / (outH * ss)
      if (tables) {
        lookup(tables.left, v, rowE, 0)
        lookup(tables.right, v, rowE, 2)
      }
      for (let sx = 0; sx < subW; sx++) {
        let u = (sx + 0.5) / subW
        let vv = v
        if (tables) {
          const uu = u
          u =
            uu +
            (1 - v) * colT[sx * 2] +
            v * colB[sx * 2] +
            (1 - uu) * rowE[0] +
            uu * rowE[2]
          vv =
            v +
            (1 - v) * colT[sx * 2 + 1] +
            v * colB[sx * 2 + 1] +
            (1 - uu) * rowE[1] +
            uu * rowE[3]
        }
        const w = H[6] * u + H[7] * vv + H[8]
        if (w <= 1e-12 && w >= -1e-12) continue
        const px = ((H[0] * u + H[1] * vv + H[2]) / w) * scale - 0.5
        const py = ((H[3] * u + H[4] * vv + H[5]) / w) * scale - 0.5
        if (px < -0.5 || py < -0.5 || px > sw - 0.5 || py > sh - 0.5) continue
        const cx = px < 0 ? 0 : px > sw - 1 ? sw - 1 : px
        const cy = py < 0 ? 0 : py > sh - 1 ? sh - 1 : py
        const x0 = Math.floor(cx)
        const y0 = Math.floor(cy)
        const x1 = x0 + 1 < sw ? x0 + 1 : x0
        const y1 = y0 + 1 < sh ? y0 + 1 : y0
        const fx = cx - x0
        const fy = cy - y0
        const i00 = (y0 * sw + x0) * 4
        const i10 = (y0 * sw + x1) * 4
        const i01 = (y1 * sw + x0) * 4
        const i11 = (y1 * sw + x1) * 4
        const w00 = (1 - fx) * (1 - fy)
        const w10 = fx * (1 - fy)
        const w01 = (1 - fx) * fy
        const w11 = fx * fy
        const a00 = data[i00 + 3] * w00
        const a10 = data[i10 + 3] * w10
        const a01 = data[i01 + 3] * w01
        const a11 = data[i11 + 3] * w11
        const k = Math.floor(sx / ss) * 4
        // 透明を混ぜても色がにじまないよう、アルファをかけてためる
        acc[k] +=
          data[i00] * a00 + data[i10] * a10 + data[i01] * a01 + data[i11] * a11
        acc[k + 1] +=
          data[i00 + 1] * a00 +
          data[i10 + 1] * a10 +
          data[i01 + 1] * a01 +
          data[i11 + 1] * a11
        acc[k + 2] +=
          data[i00 + 2] * a00 +
          data[i10 + 2] * a10 +
          data[i01 + 2] * a01 +
          data[i11 + 2] * a11
        acc[k + 3] += a00 + a10 + a01 + a11
      }
    }
    const row = y * outW * 4
    for (let x = 0; x < outW; x++) {
      const k = x * 4
      const a = acc[k + 3]
      if (a <= 0) continue
      o[row + k] = acc[k] / a
      o[row + k + 1] = acc[k + 1] / a
      o[row + k + 2] = acc[k + 2] / a
      o[row + k + 3] = a / n
    }
  }
  return out
}
