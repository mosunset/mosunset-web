// だいたいの位置に置いた 7 つの角を、写真の箱の辺に吸い付ける（DOM を使わないので node でも動く）
//
// 1. 写真を縮め（長い辺 2000px まで）、少しぼかす
// 2. 9 本の辺それぞれで、両端を辺と直角の向きに ±range px 動かした線を全部ためし、
//    「線の両側の帯（幅数 px）の平均の色の差」を線に沿って測った 35% 点がいちばん大きい線を選ぶ。
//    帯の平均どうしを比べるので、箱に印刷された細い枠線（両側とも箱の色）には吸い付かず、
//    35% 点なので、絵や文字のように辺の一部にしかない線にも引っぱられない
// 3. はっきりした辺が見つからない辺（机に溶けた奥の辺など）は、置いた位置のまま使う
// 4. 角は、そこで交わる 2〜3 本の線の交点（最小二乗）

import {
  boxEdges,
  type CornerKey,
  type Corners,
  cornerKeys,
  type Pt,
  type Raster,
} from './render'

const WORK_SIDE = 2000
const Q = 0.35

type Planes = { p: Float32Array[]; w: number; h: number }

function prepare(img: Raster): { g: Planes; scale: number } {
  const k = Math.max(1, Math.ceil(Math.max(img.width, img.height) / WORK_SIDE))
  const w = Math.floor(img.width / k)
  const h = Math.floor(img.height / k)
  const ch = img.channels
  // k×k の平均で縮め、少しぼかす（縦横 1-2-1）
  const p = [0, 1, 2].map((c) => {
    const a = new Float32Array(w * h)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = 0
        for (let yy = 0; yy < k; yy++)
          for (let xx = 0; xx < k; xx++)
            v += img.data[((y * k + yy) * img.width + x * k + xx) * ch + c]
        a[y * w + x] = v / (k * k)
      }
    const t = new Float32Array(w * h)
    for (let y = 0; y < h; y++)
      for (let x = 1; x < w - 1; x++)
        t[y * w + x] =
          (a[y * w + x - 1] + 2 * a[y * w + x] + a[y * w + x + 1]) / 4
    for (let y = 1; y < h - 1; y++)
      for (let x = 0; x < w; x++)
        a[y * w + x] =
          (t[(y - 1) * w + x] + 2 * t[y * w + x] + t[(y + 1) * w + x]) / 4
    return a
  })
  return { g: { p, w, h }, scale: 1 / k }
}

/** 線の両側の帯（線から 1.5〜BAND px）の平均の色の差を、線に沿って測った 35% 点 */
function scorer(G: Planes, band: number) {
  const at = (arr: Float32Array, x: number, y: number) => {
    if (x < 0 || y < 0 || x >= G.w - 1 || y >= G.h - 1) return Number.NaN
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    const i = y0 * G.w + x0
    return (
      (arr[i] * (1 - fx) + arr[i + 1] * fx) * (1 - fy) +
      (arr[i + G.w] * (1 - fx) + arr[i + G.w + 1] * fx) * fy
    )
  }
  const offs: number[] = []
  for (let d = 1.5; d <= band + 1e-9; d += Math.max(1, (band - 1.5) / 3))
    offs.push(d)
  const buf = new Float64Array(4096)
  return (A: Pt, B: Pt) => {
    const dx = B.x - A.x
    const dy = B.y - A.y
    const len = Math.hypot(dx, dy)
    if (!(len > 8)) return 0
    const nx = -dy / len
    const ny = dx / len
    const n = Math.min(4000, Math.max(16, Math.round(len / 2)))
    for (let k = 0; k < n; k++) {
      const t = 0.12 + (0.76 * k) / (n - 1)
      const x = A.x + dx * t
      const y = A.y + dy * t
      let best = 0
      for (const arr of G.p) {
        let a = 0
        let b = 0
        for (const d of offs) {
          a += at(arr, x + nx * d, y + ny * d)
          b += at(arr, x - nx * d, y - ny * d)
        }
        const v = Math.abs(a - b) / offs.length
        if (v > best) best = v
      }
      buf[k] = Number.isNaN(best) ? 0 : best
    }
    const arr = buf.subarray(0, n).slice().sort()
    return arr[Math.floor(n * Q)]
  }
}

type Line = { a: Pt; b: Pt }

/** 線の交点（2〜3 本。最小二乗） */
function meet(lines: Line[]): Pt | null {
  let a11 = 0
  let a12 = 0
  let a22 = 0
  let b1 = 0
  let b2 = 0
  for (const { a, b } of lines) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (!len) continue
    const nx = -dy / len
    const ny = dx / len
    const c = nx * a.x + ny * a.y
    a11 += nx * nx
    a12 += nx * ny
    a22 += ny * ny
    b1 += nx * c
    b2 += ny * c
  }
  const det = a11 * a22 - a12 * a12
  if (Math.abs(det) < 1e-9) return null
  return { x: (a22 * b1 - a12 * b2) / det, y: (a11 * b2 - a12 * b1) / det }
}

export type SnapResult = {
  corners: Corners
  /** 辺ごとに、吸い付いたか（はっきりした辺が見つからず、置いた位置のままなら false） */
  snapped: boolean[]
}

/**
 * 角を辺に吸い付ける。range は写真の画素で、辺を探す幅。
 * fixed に入れた角は動かさない（その角を通る辺は、その角を端に固定して探す）
 */
export function snapCorners(
  img: Raster,
  c: Corners,
  range = 40,
  fixed: readonly CornerKey[] = [],
): SnapResult {
  const { g, scale } = prepare(img)
  // 帯の幅: 写真の長い辺の 0.4%（4000px の写真で 16px）くらい
  const score = scorer(g, Math.max(3, Math.max(g.w, g.h) * 0.004))
  const s = (p: Pt): Pt => ({ x: p.x * scale, y: p.y * scale })
  const R = Math.max(3, range * scale)
  const lines: Line[] = []
  const snapped: boolean[] = []
  for (const [ka, kb] of boxEdges) {
    const A = s(c[ka])
    const B = s(c[kb])
    const len = Math.hypot(B.x - A.x, B.y - A.y)
    const n = { x: -(B.y - A.y) / len, y: (B.x - A.x) / len }
    const at = (p: Pt, o: number) => ({ x: p.x + n.x * o, y: p.y + n.y * o })
    const base = score(A, B)
    let best = { o0: 0, o1: 0, v: base }
    const range0 = fixed.includes(ka) ? 0 : R
    const range1 = fixed.includes(kb) ? 0 : R
    // 粗く（1px おき）→ 細かく（0.25px おき）
    for (const [step, c0, c1, span0, span1] of [
      [1, 0, 0, range0, range1],
      [0.25, NaN, NaN, 1.5, 1.5],
    ]) {
      const m0 = Number.isNaN(c0) ? best.o0 : c0
      const m1 = Number.isNaN(c1) ? best.o1 : c1
      for (let o0 = -span0; o0 <= span0 + 1e-9; o0 += step)
        for (let o1 = -span1; o1 <= span1 + 1e-9; o1 += step) {
          const p0 = Math.max(-range0, Math.min(range0, m0 + o0))
          const p1 = Math.max(-range1, Math.min(range1, m1 + o1))
          const v = score(at(A, p0), at(B, p1))
          if (v > best.v) best = { o0: p0, o1: p1, v }
        }
    }
    // はっきりした辺がないとき（いちばん良い線でも弱い・置いた線と大差ない）は、置いた線のまま
    const ok = best.v > 8 && best.v > base * 1.1
    snapped.push(ok)
    const a = ok ? at(A, best.o0) : A
    const b = ok ? at(B, best.o1) : B
    lines.push({
      a: { x: a.x / scale, y: a.y / scale },
      b: { x: b.x / scale, y: b.y / scale },
    })
  }
  const out = { ...c }
  for (const k of cornerKeys) {
    if (fixed.includes(k)) continue
    const through = boxEdges
      .map((e, i) => ({ e, i }))
      .filter(({ e, i }) => (e[0] === k || e[1] === k) && snapped[i])
      .map(({ i }) => lines[i])
    if (through.length < 2) continue
    const p = meet(through)
    // 交点が置いた角から大きく外れたら（ほぼ平行な線どうしなど）、置いた角のまま
    if (p && Math.hypot(p.x - c[k].x, p.y - c[k].y) < range * 2.5) out[k] = p
  }
  return { corners: out, snapped }
}
