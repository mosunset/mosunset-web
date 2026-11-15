import {
  bezier,
  isConvex,
  type Pt,
  type Quad,
  type Source,
  straightHandles,
} from './warp'

/**
 * 写真から、紙・画面・看板などの四角いものを自動で見つける。
 *
 * 1. 縮めた写真で、明るさ・彩度・「写真のふちの色からの遠さ」をそれぞれ大津の方法で 2 つに分け、
 *    真ん中あたりにある大きなかたまりを取り出す（穴は埋める）
 * 2. かたまりの凸包にいちばん面積の大きい四角形をはめて、四隅の候補にする
 * 3. ものが散らかった写真ではかたまりがくっつくので、Hough 変換で見つけた直線から
 *    向かい合う 2 組を選んだ四角形も候補に加える
 * 4. 候補ごとに、4 本の辺がどれだけ境目に沿っているかで点数を付けて、いちばん良いものを選ぶ
 * 5. fitEdges で、大きめの写真の上で辺の位置を細かく合わせ、辺のうねりをベジエ曲線で当てはめる
 *
 * 座標はどれも、ピクセルの左上を 0 とした連続の座標（ピクセルの中心は +0.5）。
 */

type Rgb = {
  r: Float32Array
  g: Float32Array
  b: Float32Array
  w: number
  h: number
}

/** 写真を、長い辺が maxSide 以下になるよう整数倍で縮める（ブロックの平均） */
function shrink(src: Source, maxSide: number): Rgb & { factor: number } {
  const f = Math.max(1, Math.ceil(Math.max(src.width, src.height) / maxSide))
  const w = Math.max(1, Math.floor(src.width / f))
  const h = Math.max(1, Math.floor(src.height / f))
  const r = new Float32Array(w * h)
  const g = new Float32Array(w * h)
  const b = new Float32Array(w * h)
  const d = src.data
  const n = f * f
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0
      let sg = 0
      let sb = 0
      for (let yy = y * f; yy < y * f + f; yy++) {
        let i = (yy * src.width + x * f) * 4
        for (let xx = 0; xx < f; xx++, i += 4) {
          sr += d[i]
          sg += d[i + 1]
          sb += d[i + 2]
        }
      }
      const o = y * w + x
      r[o] = sr / n
      g[o] = sg / n
      b[o] = sb / n
    }
  }
  return { r, g, b, w, h, factor: f }
}

/** 3×3 の平均でぼかす */
function blur(ch: Float32Array, w: number, h: number): Float32Array {
  const tmp = new Float32Array(ch.length)
  const out = new Float32Array(ch.length)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      const l = ch[row + (x > 0 ? x - 1 : 0)]
      const r = ch[row + (x < w - 1 ? x + 1 : w - 1)]
      tmp[row + x] = (l + ch[row + x] + r) / 3
    }
  }
  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : 0) * w
    const down = (y < h - 1 ? y + 1 : h - 1) * w
    const row = y * w
    for (let x = 0; x < w; x++) {
      out[row + x] = (tmp[up + x] + tmp[row + x] + tmp[down + x]) / 3
    }
  }
  return out
}

function blurRgb(img: Rgb): Rgb {
  return {
    ...img,
    r: blur(img.r, img.w, img.h),
    g: blur(img.g, img.w, img.h),
    b: blur(img.b, img.w, img.h),
  }
}

/** 双線形補間で色を読む */
function readRgb(img: Rgb, x: number, y: number, out: Float64Array) {
  const { w, h } = img
  let fx = x - 0.5
  let fy = y - 0.5
  fx = fx < 0 ? 0 : fx > w - 1 ? w - 1 : fx
  fy = fy < 0 ? 0 : fy > h - 1 ? h - 1 : fy
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = x0 + 1 < w ? x0 + 1 : x0
  const y1 = y0 + 1 < h ? y0 + 1 : y0
  const tx = fx - x0
  const ty = fy - y0
  const i00 = y0 * w + x0
  const i10 = y0 * w + x1
  const i01 = y1 * w + x0
  const i11 = y1 * w + x1
  const a = (1 - tx) * (1 - ty)
  const b = tx * (1 - ty)
  const c = (1 - tx) * ty
  const d = tx * ty
  out[0] = img.r[i00] * a + img.r[i10] * b + img.r[i01] * c + img.r[i11] * d
  out[1] = img.g[i00] * a + img.g[i10] * b + img.g[i01] * c + img.g[i11] * d
  out[2] = img.b[i00] * a + img.b[i10] * b + img.b[i01] * c + img.b[i11] * d
}

const ca = new Float64Array(3)
const cb = new Float64Array(3)
/** 2 点の色の違い（RGB の距離） */
function colorDiff(img: Rgb, p: Pt, q: Pt): number {
  readRgb(img, p.x, p.y, ca)
  readRgb(img, q.x, q.y, cb)
  return Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2])
}

/** 大津の方法でしきい値を決める */
function otsu(v: Float32Array): number {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const x of v) {
    if (x < min) min = x
    if (x > max) max = x
  }
  if (max - min < 1e-6) return max
  const bins = 256
  const hist = new Float64Array(bins)
  const k = (bins - 1) / (max - min)
  for (const x of v) hist[Math.round((x - min) * k)]++
  const total = v.length
  let sumAll = 0
  for (let i = 0; i < bins; i++) sumAll += i * hist[i]
  let wB = 0
  let sumB = 0
  let best = 0
  let bestVar = -1
  for (let i = 0; i < bins; i++) {
    wB += hist[i]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += i * hist[i]
    const mB = sumB / wB
    const mF = (sumAll - sumB) / wF
    const between = wB * wF * (mB - mF) ** 2
    if (between > bestVar) {
      bestVar = between
      best = i
    }
  }
  return min + (best + 0.5) / k
}

/** 3×3 の収縮・膨張（ふちは外側を同じ値とみなす） */
function morph(m: Uint8Array, w: number, h: number, dilate: boolean) {
  const tmp = new Uint8Array(m.length)
  const out = new Uint8Array(m.length)
  const pick = dilate
    ? (a: number, b: number, c: number) => a | b | c
    : (a: number, b: number, c: number) => a & b & c
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      tmp[row + x] = pick(
        m[row + (x > 0 ? x - 1 : 0)],
        m[row + x],
        m[row + (x < w - 1 ? x + 1 : w - 1)],
      )
    }
  }
  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : 0) * w
    const down = (y < h - 1 ? y + 1 : h - 1) * w
    const row = y * w
    for (let x = 0; x < w; x++) {
      out[row + x] = pick(tmp[up + x], tmp[row + x], tmp[down + x])
    }
  }
  return out
}

/** いちばん「それらしい」かたまり（大きくて、真ん中にかかっているもの）を、穴を埋めて返す */
function mainBlob(m: Uint8Array, w: number, h: number): Uint8Array | null {
  const n = w * h
  const label = new Int32Array(n).fill(-1)
  const stack = new Int32Array(n)
  const cx0 = w * 0.3
  const cx1 = w * 0.7
  const cy0 = h * 0.3
  const cy1 = h * 0.7
  let bestLabel = -1
  let bestScore = 0
  let next = 0
  for (let start = 0; start < n; start++) {
    if (!m[start] || label[start] >= 0) continue
    let top = 0
    stack[top++] = start
    label[start] = next
    let area = 0
    let center = 0
    while (top > 0) {
      const i = stack[--top]
      area++
      const x = i % w
      const y = (i - x) / w
      if (x >= cx0 && x < cx1 && y >= cy0 && y < cy1) center++
      if (x > 0 && m[i - 1] && label[i - 1] < 0) {
        label[i - 1] = next
        stack[top++] = i - 1
      }
      if (x < w - 1 && m[i + 1] && label[i + 1] < 0) {
        label[i + 1] = next
        stack[top++] = i + 1
      }
      if (y > 0 && m[i - w] && label[i - w] < 0) {
        label[i - w] = next
        stack[top++] = i - w
      }
      if (y < h - 1 && m[i + w] && label[i + w] < 0) {
        label[i + w] = next
        stack[top++] = i + w
      }
    }
    if (area >= n * 0.02 && area <= n * 0.98) {
      const score = area * (center > 0 ? 1 : 0.35)
      if (score > bestScore) {
        bestScore = score
        bestLabel = next
      }
    }
    next++
  }
  if (bestLabel < 0) return null
  // ふちから外側を塗って、届かなかった所（かたまりと、その中の穴）を残す
  const outside = new Uint8Array(n)
  let top = 0
  const push = (i: number) => {
    if (label[i] !== bestLabel && !outside[i]) {
      outside[i] = 1
      stack[top++] = i
    }
  }
  for (let x = 0; x < w; x++) {
    push(x)
    push((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    push(y * w)
    push(y * w + w - 1)
  }
  while (top > 0) {
    const i = stack[--top]
    const x = i % w
    if (x > 0) push(i - 1)
    if (x < w - 1) push(i + 1)
    if (i >= w) push(i - w)
    if (i < n - w) push(i + w)
  }
  const blob = new Uint8Array(n)
  for (let i = 0; i < n; i++) blob[i] = outside[i] ? 0 : 1
  return blob
}

const cross = (o: Pt, a: Pt, b: Pt) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/** 凸包（Andrew の方法） */
function convexHull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (p.length < 3) return p
  const lower: Pt[] = []
  for (const q of p) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0
    )
      lower.pop()
    lower.push(q)
  }
  const upper: Pt[] = []
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0
    )
      upper.pop()
    upper.push(q)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

/** 面積への効き目が小さい頂点から順に外して、max 個以下にする（Visvalingam） */
function reducePolygon(poly: Pt[], max: number): Pt[] {
  const p = [...poly]
  while (p.length > max) {
    let minArea = Number.POSITIVE_INFINITY
    let minI = 0
    for (let i = 0; i < p.length; i++) {
      const a = p[(i - 1 + p.length) % p.length]
      const b = p[i]
      const c = p[(i + 1) % p.length]
      const area = Math.abs(cross(a, b, c))
      if (area < minArea) {
        minArea = area
        minI = i
      }
    }
    p.splice(minI, 1)
  }
  return p
}

function polygonArea(p: Pt[]): number {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

/** 凸多角形の頂点から、面積がいちばん大きい四角形を選ぶ */
function largestQuad(poly: Pt[]): Pt[] | null {
  const n = poly.length
  if (n < 4) return null
  let best: Pt[] | null = null
  let bestArea = 0
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++)
        for (let l = k + 1; l < n; l++) {
          const q = [poly[i], poly[j], poly[k], poly[l]]
          const a = Math.abs(polygonArea(q))
          if (a > bestArea) {
            bestArea = a
            best = q
          }
        }
  return best
}

/**
 * 左上・右上・右下・左下の順（画面で時計回り）に並べる。
 * 真ん中からの角度で並べ、中点がいちばん上にある辺を「上の辺」にする
 */
function orderCorners(q: Pt[]): Quad['corners'] {
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4
  const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4
  let p = [...q].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  )
  let start = 0
  let top = Number.POSITIVE_INFINITY
  for (let i = 0; i < 4; i++) {
    const mid = (p[i].y + p[(i + 1) % 4].y) / 2
    if (mid < top) {
      top = mid
      start = i
    }
  }
  p = [...p.slice(start), ...p.slice(0, start)]
  return [p[0], p[1], p[2], p[3]]
}

/** 辺 a→b の外向きの単位法線（画面で時計回りの並びのとき） */
function outward(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  return { x: dy / len, y: -dx / len }
}

/** これだけ色が変われば「辺がある」とみなす（縮めてぼかした写真で、3 px 離れた 2 点の RGB の距離） */
const EDGE_STRONG = 50

/**
 * 四角形の 4 本の辺が、写真の中の境目にどれだけ沿っているか（0〜1）。
 * 辺ごとに「はっきり色が変わる所の割合」を測り、平均といちばん弱い辺の平均を返す
 * （1 本でも辺が見えない四角形は低くなる）
 */
function edgeSupport(img: Rgb, c: Quad['corners'], samples = 32): number {
  let sum = 0
  let min = 1
  for (let e = 0; e < 4; e++) {
    const a = c[e]
    const b = c[(e + 1) % 4]
    const n = outward(a, b)
    let cover = 0
    const thirds = [0, 0, 0]
    const counts = [0, 0, 0]
    for (let k = 0; k < samples; k++) {
      const t = 0.06 + (0.88 * k) / (samples - 1)
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      let best = 0
      for (let s = -2; s <= 2; s++) {
        const d = colorDiff(
          img,
          { x: p.x + n.x * (s + 1.5), y: p.y + n.y * (s + 1.5) },
          { x: p.x + n.x * (s - 1.5), y: p.y + n.y * (s - 1.5) },
        )
        if (d > best) best = d
      }
      const v = Math.min(1, best / EDGE_STRONG)
      const part = Math.min(2, Math.floor((k * 3) / samples))
      cover += v
      thirds[part] += v
      counts[part]++
    }
    // 物の端を越えて伸びた辺は、どこかの 3 分の 1 が弱くなるので低くする
    const weakest = Math.min(
      ...thirds.map((t, i) => (counts[i] ? t / counts[i] : 0)),
    )
    cover = (cover / samples + weakest) / 2
    sum += cover
    if (cover < min) min = cover
  }
  return (sum / 4 + min) / 2
}

type Line = { theta: number; rho: number; votes: number }

/**
 * まっすぐな境目を Hough 変換で探す。色ごとの Sobel でいちばん強い向きを使い、
 * 勾配の向きの近くの角度にだけ投票する（速く、まぎれも少ない）
 */
function houghLines(img: Rgb, max: number): Line[] {
  const { w, h } = img
  const n = w * h
  const gx = new Float32Array(n)
  const gy = new Float32Array(n)
  const mag = new Float32Array(n)
  const chs = [img.r, img.g, img.b]
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      let best = 0
      let bx = 0
      let by = 0
      for (const ch of chs) {
        const sx =
          ch[i - w + 1] +
          2 * ch[i + 1] +
          ch[i + w + 1] -
          (ch[i - w - 1] + 2 * ch[i - 1] + ch[i + w - 1])
        const sy =
          ch[i + w - 1] +
          2 * ch[i + w] +
          ch[i + w + 1] -
          (ch[i - w - 1] + 2 * ch[i - w] + ch[i - w + 1])
        const m = sx * sx + sy * sy
        if (m > best) {
          best = m
          bx = sx
          by = sy
        }
      }
      gx[i] = bx
      gy[i] = by
      mag[i] = Math.sqrt(best)
    }
  }
  const sorted = Float32Array.from(mag).sort()
  const thr = Math.max(40, sorted[Math.floor(n * 0.85)])
  const TH = 180
  const D = Math.ceil(Math.hypot(w, h))
  const R = 2 * D + 1
  const acc = new Float32Array(TH * R)
  const cos = new Float64Array(TH)
  const sin = new Float64Array(TH)
  for (let t = 0; t < TH; t++) {
    cos[t] = Math.cos((t * Math.PI) / TH)
    sin[t] = Math.sin((t * Math.PI) / TH)
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (mag[i] < thr) continue
      const deg = Math.round((Math.atan2(gy[i], gx[i]) * 180) / Math.PI)
      for (let d = -3; d <= 3; d++) {
        const t = (((deg + d) % 180) + 180) % 180
        // 勾配の向きが 180° 回っていても同じ線になるよう、rho の符号をそろえる
        const rho = Math.round((x + 0.5) * cos[t] + (y + 0.5) * sin[t]) + D
        acc[t * R + rho] += mag[i]
      }
    }
  }
  let top = 0
  for (const v of acc) if (v > top) top = v
  const peaks: Line[] = []
  for (let t = 0; t < TH; t++) {
    for (let r = 3; r < R - 3; r++) {
      const v = acc[t * R + r]
      if (v < top * 0.08) continue
      let isMax = true
      for (let dt = -2; dt <= 2 && isMax; dt++) {
        const tt = t + dt
        if (tt < 0 || tt >= TH) continue
        for (let dr = -3; dr <= 3; dr++) {
          if ((dt || dr) && acc[tt * R + r + dr] > v) {
            isMax = false
            break
          }
        }
      }
      if (isMax) peaks.push({ theta: (t * Math.PI) / TH, rho: r - D, votes: v })
    }
  }
  peaks.sort((a, b) => b.votes - a.votes)
  // ほとんど同じ線は 1 本にまとめる（0° と 180° の境もまたいで比べる）
  const out: Line[] = []
  const near = (5 * Math.PI) / 180
  for (const l of peaks) {
    const dup = out.some((o) => {
      const d = Math.abs(o.theta - l.theta)
      if (d < near) return Math.abs(o.rho - l.rho) < 8
      if (Math.PI - d < near) return Math.abs(o.rho + l.rho) < 8
      return false
    })
    if (!dup) out.push(l)
    if (out.length >= max) break
  }
  return out
}

function lineAngleDiff(a: Line, b: Line): number {
  const d = Math.abs(a.theta - b.theta) % Math.PI
  return Math.min(d, Math.PI - d)
}

function lineIntersect(a: Line, b: Line): Pt | null {
  const c1 = Math.cos(a.theta)
  const s1 = Math.sin(a.theta)
  const c2 = Math.cos(b.theta)
  const s2 = Math.sin(b.theta)
  const det = c1 * s2 - s1 * c2
  if (Math.abs(det) < 1e-6) return null
  return {
    x: (a.rho * s2 - s1 * b.rho) / det,
    y: (c1 * b.rho - a.rho * c2) / det,
  }
}

/** 真ん中の点から線までの、向きを考えた距離 */
function signedDist(l: Line, x: number, y: number) {
  return x * Math.cos(l.theta) + y * Math.sin(l.theta) - l.rho
}

/** 見つけた直線から、向かい合う 2 組を選んで四角形の候補を作る */
function quadsFromLines(
  lines: Line[],
  w: number,
  h: number,
): Quad['corners'][] {
  const deg = Math.PI / 180
  const pairs: [Line, Line][] = []
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i]
      const b = lines[j]
      if (lineAngleDiff(a, b) > 35 * deg) continue
      // 同じ線の重なりでないこと（写真の真ん中での位置の差で見る）
      const da = signedDist(a, w / 2, h / 2)
      const db = signedDist(b, w / 2, h / 2)
      const gap = Math.abs(a.theta - b.theta) < Math.PI / 2 ? da - db : da + db
      if (Math.abs(gap) < Math.min(w, h) * 0.08) continue
      pairs.push([a, b])
    }
  }
  const out: Quad['corners'][] = []
  const mx = w * 0.03
  const my = h * 0.03
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const [p0, p1] = pairs[i]
      const [q0, q1] = pairs[j]
      if (p0 === q0 || p0 === q1 || p1 === q0 || p1 === q1) continue
      let ok = true
      for (const a of pairs[i])
        for (const b of pairs[j]) if (lineAngleDiff(a, b) < 25 * deg) ok = false
      if (!ok) continue
      const c = [
        lineIntersect(p0, q0),
        lineIntersect(p0, q1),
        lineIntersect(p1, q1),
        lineIntersect(p1, q0),
      ]
      if (c.some((p) => !p)) continue
      const pts = c as Pt[]
      if (
        pts.some((p) => p.x < -mx || p.x > w + mx || p.y < -my || p.y > h + my)
      )
        continue
      const corners = orderCorners(pts)
      if (!isConvex(corners)) continue
      if (Math.abs(polygonArea(corners)) < w * h * 0.04) continue
      out.push(corners)
    }
  }
  return out
}

/** かたまりの形に四角形をはめる */
function quadFromBlob(blob: Uint8Array, w: number, h: number): Pt[] | null {
  // 各行の左端と右端のピクセルの角を集めて凸包を取る
  const pts: Pt[] = []
  for (let y = 0; y < h; y++) {
    let x0 = -1
    let x1 = -1
    for (let x = 0; x < w; x++) {
      if (blob[y * w + x]) {
        if (x0 < 0) x0 = x
        x1 = x
      }
    }
    if (x0 < 0) continue
    pts.push(
      { x: x0, y },
      { x: x0, y: y + 1 },
      { x: x1 + 1, y },
      { x: x1 + 1, y: y + 1 },
    )
  }
  if (pts.length < 4) return null
  const hull = reducePolygon(convexHull(pts), 36)
  return largestQuad(hull)
}

export type Detection = { quad: Quad; score: number }

/** 縮めた写真の上での四隅の候補を探す。見つからなければ null */
export function detectQuad(src: Source): Detection | null {
  const small = shrink(src, 400)
  const img = blurRgb(small)
  const { w, h } = img
  const n = w * h

  // 写真のふち（背景のことが多い）の色の中央値
  const ring = Math.max(2, Math.round(Math.min(w, h) * 0.03))
  const br: number[] = []
  const bg: number[] = []
  const bb: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= ring && x < w - ring && y >= ring && y < h - ring) continue
      const i = y * w + x
      br.push(img.r[i])
      bg.push(img.g[i])
      bb.push(img.b[i])
    }
  }
  const median = (a: number[]) => {
    a.sort((x, y) => x - y)
    return a[Math.floor(a.length / 2)] ?? 0
  }
  const mr = median(br)
  const mg = median(bg)
  const mb = median(bb)

  const gray = new Float32Array(n)
  const sat = new Float32Array(n)
  const far = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const r = img.r[i]
    const g = img.g[i]
    const b = img.b[i]
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b
    sat[i] = Math.max(r, g, b) - Math.min(r, g, b)
    far[i] = Math.hypot(r - mr, g - mg, b - mb)
  }

  const masks: Uint8Array[] = []
  for (const [ch, both] of [
    [far, false],
    [gray, true],
    [sat, true],
  ] as const) {
    const t = otsu(ch)
    const hi = new Uint8Array(n)
    for (let i = 0; i < n; i++) hi[i] = ch[i] > t ? 1 : 0
    masks.push(hi)
    if (both) {
      const lo = new Uint8Array(n)
      for (let i = 0; i < n; i++) lo[i] = hi[i] ? 0 : 1
      masks.push(lo)
    }
  }

  // 候補を集める: 色のかたまりから作ったものと、直線から作ったもの
  const candidates: Quad['corners'][] = []
  for (const raw of masks) {
    // 小さな点を消して（開く）、細いすき間をふさぐ（閉じる）
    let m = morph(morph(raw, w, h, false), w, h, true)
    m = morph(morph(m, w, h, true), w, h, false)
    const blob = mainBlob(m, w, h)
    if (!blob) continue
    const q = quadFromBlob(blob, w, h)
    if (!q) continue
    const corners = orderCorners(q)
    if (!isConvex(corners)) continue
    if (Math.abs(polygonArea(corners)) < n * 0.03) continue
    candidates.push(corners)
  }
  candidates.push(...quadsFromLines(houghLines(img, 18), w, h))

  // 粗く点を付けて上位にしぼり、上位だけ細かく点を付け直す
  const score = (c: Quad['corners'], samples: number) =>
    edgeSupport(img, c, samples) * (Math.abs(polygonArea(c)) / n) ** 0.15
  const rough = candidates
    .map((c) => ({ c, s: score(c, 10) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 12)
  let best: { corners: Quad['corners']; score: number } | null = null
  for (const { c } of rough) {
    const s = score(c, 32)
    if (!best || s > best.score) best = { corners: c, score: s }
  }
  if (!best || best.score < 0.35) return null

  // 縮めた写真の座標 → 元の写真の座標
  const k = 1 / (src.scale / small.factor)
  const corners = best.corners.map((p) => ({
    x: p.x * k,
    y: p.y * k,
  })) as Quad['corners']
  return { quad: { corners, handles: straightHandles() }, score: best.score }
}

/** 小さな連立一次方程式を解く（ガウスの消去法） */
function solveLinear(m: number[][], v: number[]): number[] | null {
  const n = v.length
  const a = m.map((row, i) => [...row, v[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++)
      if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r
    if (Math.abs(a[piv][col]) < 1e-12) return null
    ;[a[col], a[piv]] = [a[piv], a[col]]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = a[r][col] / a[col][col]
      for (let k = col; k <= n; k++) a[r][k] -= f * a[col][k]
    }
  }
  return a.map((row, i) => row[n] / row[i])
}

/**
 * 辺の点に、弦（a→b）の向きを横軸にした 3 次式「ずれ = f(弦に沿った位置)」を当てはめる。
 * 返すのは、点 g を弦に垂直に動かして曲線の上へ乗せる関数（角を求めるのに使う）
 */
function fitEdgeCurve(
  a: Pt,
  b: Pt,
  pts: { t: number; p: Pt }[],
): ((g: Pt) => Pt) | null {
  if (pts.length < 6) return null
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
  const n = outward(a, b)
  const xs = pts.map(({ p }) => ((p.x - a.x) * u.x + (p.y - a.y) * u.y) / len)
  const ys = pts.map(({ p }) => (p.x - a.x) * n.x + (p.y - a.y) * n.y)
  // 角の近くへ延ばすので、暴れにくい 式は点が多いときだけ 3 次にする
  const deg = pts.length >= 24 ? 3 : pts.length >= 12 ? 2 : 1
  const fit = (idx: number[]) => {
    const m = Array.from({ length: deg + 1 }, () => new Array(deg + 1).fill(0))
    const v = new Array(deg + 1).fill(0)
    for (const i of idx) {
      const pw = [1]
      for (let d = 1; d <= deg * 2; d++) pw.push(pw[d - 1] * xs[i])
      for (let r = 0; r <= deg; r++) {
        v[r] += pw[r] * ys[i]
        for (let c = 0; c <= deg; c++) m[r][c] += pw[r + c]
      }
    }
    return solveLinear(m, v)
  }
  const evalAt = (co: number[], x: number) => {
    let y = 0
    for (let d = co.length - 1; d >= 0; d--) y = y * x + co[d]
    return y
  }
  const all = xs.map((_, i) => i)
  let co = fit(all)
  if (!co) return null
  const first = co
  const res = all.map((i) => Math.abs(evalAt(first, xs[i]) - ys[i]))
  const sorted = [...res].sort((x, y) => x - y)
  const limit = Math.max(1, sorted[Math.floor(sorted.length / 2)] * 3)
  const kept = all.filter((i) => res[i] <= limit)
  if (kept.length >= deg + 3) co = fit(kept) ?? co
  const coef = co
  return (g) => {
    const x = ((g.x - a.x) * u.x + (g.y - a.y) * u.y) / len
    const y = evalAt(coef, x)
    return {
      x: a.x + u.x * x * len + n.x * y,
      y: a.y + u.y * x * len + n.y * y,
    }
  }
}

type EdgePoint = { t: number; p: Pt }

/**
 * まっすぐな辺 a→b に沿って、辺に垂直な向きに ±band の範囲で、背景と物の境目を探す。
 * 紙の中の枠線や箱に印刷された帯のほうが色の変化が強いことがあるので、いちばん強い所ではなく、
 * 外側（背景）から内へたどって、背景の色から十分に離れた最初の所を境目とし、
 * その近くで色の変化がいちばん大きい所へ寄せる
 */
function scanEdge(img: Rgb, a: Pt, b: Pt, band: number, samples: number) {
  const n = outward(a, b)
  const out: EdgePoint[] = []
  const strengths: number[] = []
  const step = 0.5
  const count = Math.round((band * 2) / step) + 1
  const grad = new Float64Array(count)
  const dist = new Float64Array(count)
  const col = new Float64Array(3)
  const ref = new Float64Array(3)
  const near = Math.round(3 / step)
  for (let k = 0; k < samples; k++) {
    const t = 0.03 + (0.94 * k) / (samples - 1)
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    const at = (s: number): Pt => ({ x: p.x + n.x * s, y: p.y + n.y * s })
    // 背景の色（探す範囲のすぐ外）
    ref.fill(0)
    for (let j = 1; j <= 3; j++) {
      const q = at(band + j)
      readRgb(img, q.x, q.y, col)
      ref[0] += col[0] / 3
      ref[1] += col[1] / 3
      ref[2] += col[2] / 3
    }
    let maxDist = 0
    for (let i = 0; i < count; i++) {
      const s = -band + i * step
      grad[i] = colorDiff(img, at(s + 1), at(s - 1))
      const q = at(s)
      readRgb(img, q.x, q.y, col)
      dist[i] = Math.hypot(col[0] - ref[0], col[1] - ref[1], col[2] - ref[2])
      if (dist[i] > maxDist) maxDist = dist[i]
    }
    // 紙の中の濃い枠線などで maxDist が大きくなっても、背景との境目を飛ばさないよう上限を付ける
    const limit = Math.max(25, Math.min(maxDist * 0.4, 70))
    let cross = -1
    for (let i = count - 1; i >= 0; i--) {
      if (dist[i] > limit) {
        cross = i
        break
      }
    }
    if (cross < 0) continue
    let bi = cross
    for (
      let i = Math.max(0, cross - near);
      i <= Math.min(count - 1, cross + near);
      i++
    ) {
      if (grad[i] > grad[bi]) bi = i
    }
    // 放物線で山の頂上を細かく求める
    let off = 0
    if (bi > 0 && bi < count - 1) {
      const den = grad[bi - 1] - 2 * grad[bi] + grad[bi + 1]
      if (den < 0) off = (0.5 * (grad[bi - 1] - grad[bi + 1])) / den
    }
    strengths.push(grad[bi])
    out.push({ t, p: at(-band + (bi + off) * step) })
  }
  // 色の変化が弱すぎる所（辺が見えていない所）は使わない
  const sorted = [...strengths].sort((x, y) => x - y)
  const floor = Math.max(
    6,
    (sorted[Math.floor(sorted.length * 0.5)] ?? 0) * 0.35,
  )
  return out.filter((_, i) => strengths[i] >= floor)
}

/** 両端を固定して、点の集まりに 3 次ベジエを最小二乗で当てはめる。返すのは内側の 2 つの制御点 */
function fitBezier(p0: Pt, p3: Pt, pts: EdgePoint[]): [Pt, Pt] | null {
  if (pts.length < 8) return null
  const solve = (ps: EdgePoint[]) => {
    let a11 = 0
    let a12 = 0
    let a22 = 0
    let rx1 = 0
    let ry1 = 0
    let rx2 = 0
    let ry2 = 0
    for (const { t, p } of ps) {
      const s = 1 - t
      const b0 = s * s * s
      const b1 = 3 * s * s * t
      const b2 = 3 * s * t * t
      const b3 = t * t * t
      const qx = p.x - b0 * p0.x - b3 * p3.x
      const qy = p.y - b0 * p0.y - b3 * p3.y
      a11 += b1 * b1
      a12 += b1 * b2
      a22 += b2 * b2
      rx1 += b1 * qx
      ry1 += b1 * qy
      rx2 += b2 * qx
      ry2 += b2 * qy
    }
    const det = a11 * a22 - a12 * a12
    if (Math.abs(det) < 1e-9) return null
    return [
      { x: (rx1 * a22 - rx2 * a12) / det, y: (ry1 * a22 - ry2 * a12) / det },
      { x: (rx2 * a11 - rx1 * a12) / det, y: (ry2 * a11 - ry1 * a12) / det },
    ] as [Pt, Pt]
  }
  const first = solve(pts)
  if (!first) return null
  const ctrl: [Pt, Pt, Pt, Pt] = [p0, first[0], first[1], p3]
  const res = pts.map(({ t, p }) => {
    const q = bezier(ctrl, t)
    return Math.hypot(q.x - p.x, q.y - p.y)
  })
  const sorted = [...res].sort((a, b) => a - b)
  const limit = Math.max(1, sorted[Math.floor(sorted.length / 2)] * 3)
  const kept = pts.filter((_, i) => res[i] <= limit)
  return kept.length >= 8 ? (solve(kept) ?? first) : first
}

/**
 * 今の四隅を手がかりに、辺の本当の位置へ合わせる。
 * 1. 辺ごとに境目の点を集め、となりの辺の点に当てはめた曲線どうしの交点を新しい角にする（2 回）
 * 2. 新しい角を両端に固定して、辺の点にベジエを当てはめる（うねりがなければまっすぐのまま）
 * band は探す幅（元の写真の px）。角はもとの位置から band より遠くへは動かさない
 */
export function fitEdges(src: Source, quad: Quad, band: number): Quad {
  // 遠くの辺では、紙のふちと中の枠線の間が数 px しかないことがあるので、ぼかさずに読む
  const img: Rgb = {
    r: channel(src, 0),
    g: channel(src, 1),
    b: channel(src, 2),
    w: src.width,
    h: src.height,
  }
  const k = src.scale
  const bandPx = Math.max(4, band * k)
  const samples = 64
  const enough = (p: EdgePoint[]) => p.length >= samples * 0.4
  const start = quad.corners.map((p) => ({ x: p.x * k, y: p.y * k }))
  let c = start

  // 1. 角を合わせる（合わせた角で弦を引き直して、もう 1 度）
  for (let pass = 0; pass < 2; pass++) {
    const scans = c.map((a, e) =>
      scanEdge(img, a, c[(e + 1) % 4], bandPx, samples),
    )
    const curves = c.map((a, e) => fitEdgeCurve(a, c[(e + 1) % 4], scans[e]))
    const next = c.map((corner, i) => {
      const prev = curves[(i + 3) % 4]
      const cur = curves[i]
      // どちらかの辺で境目がはっきり見えていなければ、角は動かさない
      if (!prev || !cur || !enough(scans[(i + 3) % 4]) || !enough(scans[i]))
        return corner
      // 2 本の曲線に交互に寄せて、交点を求める
      let g = corner
      for (let it = 0; it < 30; it++) g = prev(cur(g))
      if (
        !Number.isFinite(g.x) ||
        !Number.isFinite(g.y) ||
        Math.hypot(g.x - start[i].x, g.y - start[i].y) > bandPx
      )
        return corner
      return g
    })
    if (isConvex(next as Quad['corners'])) c = next
  }

  // 2. 辺のうねりを合わせる
  const handles = straightHandles()
  for (let e = 0; e < 4; e++) {
    const a = c[e]
    const b = c[(e + 1) % 4]
    const ps = scanEdge(img, a, b, bandPx, samples)
    // 辺の半分近くで境目が見えていないと、曲がり具合は決められない
    if (!enough(ps)) continue
    const fit = fitBezier(a, b, ps)
    if (!fit) continue
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const n = outward(a, b)
    const ctrl: [Pt, Pt, Pt, Pt] = [a, fit[0], fit[1], b]
    const medianOf = (v: number[]) =>
      [...v].sort((x, y) => x - y)[Math.floor(v.length / 2)] ?? 0
    const straightRes = medianOf(
      ps.map(({ p }) => Math.abs((p.x - a.x) * n.x + (p.y - a.y) * n.y)),
    )
    const curveRes = medianOf(
      ps.map(({ t, p }) => {
        const q = bezier(ctrl, t)
        return Math.hypot(q.x - p.x, q.y - p.y)
      }),
    )
    // 点がばらついているときや、曲げてもあまり良くならないときは、まっすぐのまま
    if (curveRes > 2 || curveRes > straightRes * 0.7) continue
    const base = [
      { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
      { x: a.x + ((b.x - a.x) * 2) / 3, y: a.y + ((b.y - a.y) * 2) / 3 },
    ]
    const hs = fit.map((p, j) => {
      let hx = p.x - base[j].x
      let hy = p.y - base[j].y
      // 少しのうねりを直すためのものなので、辺の長さの 12% までにする
      const m = Math.hypot(hx, hy)
      const cap = len * 0.12
      if (m > cap) {
        hx *= cap / m
        hy *= cap / m
      }
      return { x: hx, y: hy }
    })
    // ほとんど曲がっていなければ、まっすぐのままにする
    if (hs.every((h) => Math.hypot(h.x, h.y) < 1)) continue
    handles[e] = [
      { x: hs[0].x / k, y: hs[0].y / k },
      { x: hs[1].x / k, y: hs[1].y / k },
    ]
  }
  return {
    corners: c.map((p) => ({ x: p.x / k, y: p.y / k })) as Quad['corners'],
    handles,
  }
}

function channel(src: Source, offset: number): Float32Array {
  const n = src.width * src.height
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = src.data[i * 4 + offset]
  return out
}

/** これより点数が低いときは「自信がない」として、確かめるよう伝える */
export const CONFIDENT_SCORE = 0.55

/** 自動で検出して、辺も合わせる。見つからなければ null */
export function autoDetect(
  src: Source,
  width: number,
  height: number,
): Detection | null {
  const found = detectQuad(src)
  if (!found) return null
  const diag = Math.hypot(width, height)
  return {
    quad: fitEdges(src, found.quad, diag * 0.012),
    score: found.score,
  }
}
