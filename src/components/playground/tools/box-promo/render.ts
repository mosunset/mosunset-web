// 箱の写真から「宣材写真ふう」の箱の画像を作る計算（DOM を使わないので、node でもそのまま動く）
//
// 1. 写真の 3 つの面（正面・上・右の側面）を、7 つの角から射影変換で長方形の絵（テクスチャ）に直す
// 2. 面ごとに、写り込みの白いかぶりを引き、光のむら（明るさの傾き）をならす
// 3. 箱全体で、色味（白いところが白になるように）と明るさの幅をそろえる
// 4. 正面がほぼ真正面になる角度（少し右上から）の平行投影で、3 つの面を組み立てる
// 5. 下に柔らかい影を付け、背景は透明にする

export type Pt = { x: number; y: number }

/** 箱の角の名前。F は手前・B は奥、T は上・B は下、L は左・R は右（右の側面が写っている写真） */
export const cornerKeys = [
  'FTL',
  'FTR',
  'FBR',
  'FBL',
  'BTL',
  'BTR',
  'BBR',
] as const
export type CornerKey = (typeof cornerKeys)[number]
export type Corners = Record<CornerKey, Pt>

/** 9 本の辺（外形の 6 本と、面の折り目の 3 本） */
export const boxEdges: readonly [CornerKey, CornerKey][] = [
  ['FTL', 'FTR'],
  ['FBL', 'FBR'],
  ['FTL', 'FBL'],
  ['FTR', 'FBR'],
  ['BTR', 'BBR'],
  ['FBR', 'BBR'],
  ['FTR', 'BTR'],
  ['BTL', 'BTR'],
  ['FTL', 'BTL'],
]

/** RGB または RGBA の画素 */
export type Raster = {
  data: Uint8ClampedArray | Uint8Array
  width: number
  height: number
  channels: 3 | 4
}

export type RenderOptions = {
  /** 焦点距離（写真の画素） */
  focal: number
  /** 高さを 1 とした幅と奥行き。なければ写真から推定する */
  dims?: { width: number; depth: number }
  /** 出力の長いほうの辺 */
  maxSide?: number
  /** 見る角度（度）。右に回す角度と、上から見下ろす角度 */
  yaw?: number
  pitch?: number
  /** 写り込み・光のむら・色味の補正 */
  clean?: boolean
  /** 側面の下半分の細かい筋（机の木目の映り込み）を残す割合（1 でそのまま） */
  sideDetail?: number
  /** 影の濃さ（0 で影なし） */
  shadow?: number
}

export type RenderResult = {
  /** RGBA（背景は透明） */
  data: Uint8ClampedArray
  width: number
  height: number
  /** 使った幅・奥行き（高さを 1 として） */
  dims: { width: number; depth: number }
  /** 写真から読んだ面ごとの縦横比（幅/高さ・奥行き/高さ・幅/奥行き） */
  aspects: { front: number; side: number; top: number }
}

// ---------- 線形代数 ----------
type V3 = [number, number, number]
type M3 = [V3, V3, V3]
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const hom = (p: Pt): V3 => [p.x, p.y, 1]
const mv = (A: M3, v: V3): V3 => [dot(A[0], v), dot(A[1], v), dot(A[2], v)]

/** 4 点の対応から射影変換（src → dst） */
export function homography(src: Pt[], dst: Pt[]): M3 {
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]
    const { x: u, y: v } = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    b.push(v)
  }
  const h = solve(A, b)
  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1],
  ]
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((r, i) => [...r, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++)
      if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const k = M[r][c] / M[c][c]
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j]
    }
  }
  return M.map((r, i) => r[n] / r[i])
}

/**
 * 長方形を斜めから撮った 4 隅（左上・右上・左下・右下）と焦点距離から、本当の横 / 縦を出す
 * （Zhang & He の方法。写真の真ん中を光軸とみなす）
 */
export function rectAspect(
  tl: Pt,
  tr: Pt,
  bl: Pt,
  br: Pt,
  focal: number,
  cx: number,
  cy: number,
): number {
  const m1 = hom(tl)
  const m2 = hom(tr)
  const m3 = hom(bl)
  const m4 = hom(br)
  const k2 = dot(cross(m1, m4), m3) / dot(cross(m2, m4), m3)
  const k3 = dot(cross(m1, m4), m2) / dot(cross(m3, m4), m2)
  const n2 = m2.map((v, i) => k2 * v - m1[i]) as V3
  const n3 = m3.map((v, i) => k3 * v - m1[i]) as V3
  const Ki: M3 = [
    [1 / focal, 0, -cx / focal],
    [0, 1 / focal, -cy / focal],
    [0, 0, 1],
  ]
  const q = (n: V3) => {
    const u = mv(Ki, n)
    return dot(u, u)
  }
  return Math.sqrt(q(n2) / q(n3))
}

/** 写真の 7 つの角から、高さを 1 とした幅・奥行きを推定する（面ごとの縦横比を対数の最小二乗でまとめる） */
export function estimateDims(
  c: Corners,
  focal: number,
  photoW: number,
  photoH: number,
) {
  const cx = photoW / 2
  const cy = photoH / 2
  const front = rectAspect(c.FTL, c.FTR, c.FBL, c.FBR, focal, cx, cy)
  const side = rectAspect(c.FTR, c.BTR, c.FBR, c.BBR, focal, cx, cy)
  const top = rectAspect(c.BTL, c.BTR, c.FTL, c.FTR, focal, cx, cy)
  const ok = (v: number) => Number.isFinite(v) && v > 0.05 && v < 20
  // 正面と側面を重く、上面（ふたが反りやすい）を軽く
  const eq: [number, number, number, number][] = []
  if (ok(front)) eq.push([1, 0, Math.log(front), 1])
  if (ok(side)) eq.push([0, 1, Math.log(side), 0.7])
  if (ok(top)) eq.push([1, -1, Math.log(top), 0.15])
  const A = [
    [1e-9, 0],
    [0, 1e-9],
  ]
  const bv = [0, 0]
  for (const [p, q, r, w] of eq) {
    A[0][0] += w * p * p
    A[0][1] += w * p * q
    A[1][0] += w * q * p
    A[1][1] += w * q * q
    bv[0] += w * p * r
    bv[1] += w * q * r
  }
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0]
  const lw = (A[1][1] * bv[0] - A[0][1] * bv[1]) / det
  const ld = (A[0][0] * bv[1] - A[1][0] * bv[0]) / det
  const width = ok(front) ? Math.exp(lw) : 0.7
  const depth = ok(side) || ok(top) ? Math.exp(ld) : 0.5
  return { width, depth, aspects: { front, side, top } }
}

/** 35mm 判換算の焦点距離から、写真の画素での焦点距離（35mm 判の対角 43.27mm を写真の対角に当てる） */
export function focalFrom35mm(mm: number, w: number, h: number) {
  return (mm / 43.27) * Math.hypot(w, h)
}

// ---------- テクスチャ ----------
type Tex = { w: number; h: number; d: Float32Array }

function sampler(img: Raster) {
  const { data, width: W, height: H, channels: ch } = img
  return (sx: number, sy: number, out: number[]) => {
    const x = Math.min(W - 1.001, Math.max(0, sx))
    const y = Math.min(H - 1.001, Math.max(0, sy))
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    const i00 = (y0 * W + x0) * ch
    const i10 = i00 + ch
    const i01 = i00 + W * ch
    const i11 = i01 + ch
    for (let c = 0; c < 3; c++) {
      out[c] =
        (data[i00 + c] * (1 - fx) + data[i10 + c] * fx) * (1 - fy) +
        (data[i01 + c] * (1 - fx) + data[i11 + c] * fx) * fy
    }
  }
}

/** 写真の四角形（左上・右上・右下・左下）を、tw × th の長方形の絵にする（2×2 の平均でなめらかに） */
function extract(img: Raster, quad: Pt[], tw: number, th: number): Tex {
  const H = homography(
    [
      { x: 0, y: 0 },
      { x: tw, y: 0 },
      { x: tw, y: th },
      { x: 0, y: th },
    ],
    quad,
  )
  const at = sampler(img)
  const d = new Float32Array(tw * th * 3)
  const px = [0, 0, 0]
  const offs = [0.25, 0.75]
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (const oy of offs)
        for (const ox of offs) {
          const u = x + ox
          const v = y + oy
          const Z = H[2][0] * u + H[2][1] * v + H[2][2]
          at(
            (H[0][0] * u + H[0][1] * v + H[0][2]) / Z - 0.5,
            (H[1][0] * u + H[1][1] * v + H[1][2]) / Z - 0.5,
            px,
          )
          r += px[0]
          g += px[1]
          b += px[2]
        }
      const o = (y * tw + x) * 3
      d[o] = r / 4
      d[o + 1] = g / 4
      d[o + 2] = b / 4
    }
  }
  return { w: tw, h: th, d }
}

/** ブロックごとの分位点（dark = RGB の最小、lum = 明るさ） */
function blockQuantile(t: Tex, bs: number, kind: 'dark' | 'lum', q: number) {
  const gw = Math.ceil(t.w / bs)
  const gh = Math.ceil(t.h / bs)
  const G = new Float32Array(gw * gh)
  const buf: number[] = []
  for (let by = 0; by < gh; by++)
    for (let bx = 0; bx < gw; bx++) {
      buf.length = 0
      for (let y = by * bs; y < Math.min(t.h, (by + 1) * bs); y++)
        for (let x = bx * bs; x < Math.min(t.w, (bx + 1) * bs); x++) {
          const o = (y * t.w + x) * 3
          const [r, g, b] = [t.d[o], t.d[o + 1], t.d[o + 2]]
          buf.push(
            kind === 'dark'
              ? Math.min(r, g, b)
              : 0.299 * r + 0.587 * g + 0.114 * b,
          )
        }
      buf.sort((a, b) => a - b)
      G[by * gw + bx] =
        buf[Math.min(buf.length - 1, Math.floor(buf.length * q))]
    }
  return { G, gw, gh }
}

/** 格子の値に平面を「下側か上側の包絡」として当てはめる */
function fitEnvelope(
  G: Float32Array,
  gw: number,
  gh: number,
  side: 'lower' | 'upper',
  logDomain: boolean,
) {
  const pts: { f: number[]; val: number; w: number }[] = []
  for (let by = 0; by < gh; by++)
    for (let bx = 0; bx < gw; bx++) {
      const u = gw > 1 ? (bx / (gw - 1)) * 2 - 1 : 0
      const v = gh > 1 ? (by / (gh - 1)) * 2 - 1 : 0
      let val = G[by * gw + bx]
      if (logDomain) val = Math.log(Math.max(1, val))
      pts.push({ f: [1, u, v], val, w: 1 })
    }
  let coef = [0, 0, 0]
  for (let it = 0; it < 12; it++) {
    const A = [0, 1, 2].map(() => [0, 0, 0])
    const b = [0, 0, 0]
    for (const p of pts)
      for (let i = 0; i < 3; i++) {
        b[i] += p.w * p.f[i] * p.val
        for (let j = 0; j < 3; j++) A[i][j] += p.w * p.f[i] * p.f[j]
      }
    for (let i = 0; i < 3; i++) A[i][i] += 1e-6
    coef = solve(A, b)
    for (const p of pts) {
      const r = p.val - (coef[0] + coef[1] * p.f[1] + coef[2] * p.f[2])
      p.w = (side === 'lower' ? r > 0 : r < 0) ? 0.04 : 1
    }
  }
  return (u: number, v: number) => coef[0] + coef[1] * u + coef[2] * v
}

/** 写り込みの白いかぶり（なめらかなもの）を引く */
function removeVeil(t: Tex) {
  const { G, gw, gh } = blockQuantile(
    t,
    Math.max(8, Math.round(Math.min(t.w, t.h) / 14)),
    'dark',
    0.05,
  )
  const F = fitEnvelope(G, gw, gh, 'lower', false)
  const samples: number[] = []
  for (let y = 0; y < t.h; y += 8)
    for (let x = 0; x < t.w; x += 8)
      samples.push(F((x / (t.w - 1)) * 2 - 1, (y / (t.h - 1)) * 2 - 1))
  samples.sort((a, b) => a - b)
  const base = samples[Math.floor(samples.length * 0.05)]
  for (let y = 0; y < t.h; y++) {
    const v = (y / (t.h - 1)) * 2 - 1
    for (let x = 0; x < t.w; x++) {
      const a = Math.min(
        0.3,
        Math.max(
          0,
          ((F((x / (t.w - 1)) * 2 - 1, v) - base) / (255 - base)) * 0.7,
        ),
      )
      if (a <= 0.004) continue
      const o = (y * t.w + x) * 3
      for (let c = 0; c < 3; c++) t.d[o + c] = (t.d[o + c] - 255 * a) / (1 - a)
    }
  }
}

/** 光のむら（明るさの傾き）をならす。暗い側を持ち上げる（最大 1.5 倍） */
function flattenLight(t: Tex, strength: number) {
  const { G, gw, gh } = blockQuantile(
    t,
    Math.max(8, Math.round(Math.min(t.w, t.h) / 10)),
    'lum',
    0.95,
  )
  const F = fitEnvelope(G, gw, gh, 'upper', true)
  let top = Number.NEGATIVE_INFINITY
  for (const [u, v] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    top = Math.max(top, F(u, v))
  for (let y = 0; y < t.h; y++) {
    const v = (y / (t.h - 1)) * 2 - 1
    for (let x = 0; x < t.w; x++) {
      const gain = Math.min(
        1.5,
        Math.exp((top - F((x / (t.w - 1)) * 2 - 1, v)) * strength),
      )
      const o = (y * t.w + x) * 3
      t.d[o] *= gain
      t.d[o + 1] *= gain
      t.d[o + 2] *= gain
    }
  }
}

/** 縦横の箱ぼかし（半径 r）を 1 回 */
function boxBlur3(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  for (let y = 0; y < h; y++)
    for (let c = 0; c < 3; c++) {
      let acc = 0
      for (let i = -r; i <= r; i++)
        acc += src[(y * w + Math.min(w - 1, Math.max(0, i))) * 3 + c]
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 3 + c] = acc / (2 * r + 1)
        acc +=
          src[(y * w + Math.min(w - 1, x + r + 1)) * 3 + c] -
          src[(y * w + Math.max(0, x - r)) * 3 + c]
      }
    }
  for (let x = 0; x < w; x++)
    for (let c = 0; c < 3; c++) {
      let acc = 0
      for (let i = -r; i <= r; i++)
        acc += tmp[(Math.min(h - 1, Math.max(0, i)) * w + x) * 3 + c]
      for (let y = 0; y < h; y++) {
        out[(y * w + x) * 3 + c] = acc / (2 * r + 1)
        acc +=
          tmp[(Math.min(h - 1, y + r + 1) * w + x) * 3 + c] -
          tmp[(Math.max(0, y - r) * w + x) * 3 + c]
      }
    }
  return out
}

/** 側面の下半分の細かい筋を弱める（ぼかした絵との差を k 倍。上 40% はそのまま、60% から下は全部） */
function softenLowerDetail(t: Tex, k: number) {
  const r = Math.max(2, Math.round(t.h / 200))
  const bl = boxBlur3(t.d, t.w, t.h, r)
  for (let y = 0; y < t.h; y++) {
    const m = Math.min(1, Math.max(0, (y / (t.h - 1) - 0.4) / 0.2))
    const g = 1 - m * (1 - k)
    for (let x = 0; x < t.w; x++)
      for (let c = 0; c < 3; c++) {
        const o = (y * t.w + x) * 3 + c
        t.d[o] = bl[o] + (t.d[o] - bl[o]) * g
      }
  }
}

/** 1 チャンネルのぼかし（箱ぼかし 3 回でガウスに近づける） */
function blurMask(m: Float32Array, w: number, h: number, sigma: number) {
  const r = Math.max(1, Math.round(sigma * 0.9))
  let a = m
  for (let pass = 0; pass < 3; pass++) {
    const tmp = new Float32Array(a.length)
    const out = new Float32Array(a.length)
    for (let y = 0; y < h; y++) {
      let acc = 0
      for (let i = -r; i <= r; i++)
        acc += a[y * w + Math.min(w - 1, Math.max(0, i))]
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = acc / (2 * r + 1)
        acc +=
          a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)]
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0
      for (let i = -r; i <= r; i++)
        acc += tmp[Math.min(h - 1, Math.max(0, i)) * w + x]
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc / (2 * r + 1)
        acc +=
          tmp[Math.min(h - 1, y + r + 1) * w + x] -
          tmp[Math.max(0, y - r) * w + x]
      }
    }
    a = out
  }
  return a
}

// ---------- 本体 ----------
export function renderBox(
  img: Raster,
  c: Corners,
  opts: RenderOptions,
): RenderResult {
  const est = estimateDims(c, opts.focal, img.width, img.height)
  const BW = opts.dims?.width ?? est.width
  const BD = opts.dims?.depth ?? est.depth
  const maxSide = opts.maxSide ?? 1200
  const yaw = ((opts.yaw ?? 14) * Math.PI) / 180
  const pitch = ((opts.pitch ?? 11) * Math.PI) / 180
  const clean = opts.clean ?? true
  const sideDetail = opts.sideDetail ?? 0.35
  const shadow = opts.shadow ?? 1

  // テクスチャの、箱の高さ方向の画素（出力に見合う分だけ。写真の画素より細かくしても意味がない）
  const texH = Math.round(Math.min(1400, Math.max(300, maxSide * 1.15)))
  const tw = Math.max(8, Math.round(BW * texH))
  const td = Math.max(8, Math.round(BD * texH))
  const tex = {
    front: extract(img, [c.FTL, c.FTR, c.FBR, c.FBL], tw, texH),
    top: extract(img, [c.BTL, c.BTR, c.FTR, c.FTL], tw, td),
    side: extract(img, [c.FTR, c.BTR, c.BBR, c.FBR], td, texH),
  }
  const all = [tex.front, tex.top, tex.side]

  if (clean) {
    for (const t of all) {
      removeVeil(t)
      flattenLight(t, 0.6)
    }
    // 色味: 明るくて色の薄いところ（白い文字・ロゴなど）が白になるように
    let sr = 0
    let sg = 0
    let sb = 0
    let n = 0
    let total = 0
    for (const t of all)
      for (let i = 0; i < t.d.length; i += 9) {
        total++
        const r = t.d[i]
        const g = t.d[i + 1]
        const b = t.d[i + 2]
        const mx = Math.max(r, g, b)
        const mn = Math.min(r, g, b)
        if (mx > 175 && mx < 254 && (mx - mn) / mx < 0.12) {
          sr += r
          sg += g
          sb += b
          n++
        }
      }
    let gains = [1, 1, 1]
    if (n > total * 0.004) {
      const m = (sr + sg + sb) / n / 3
      gains = [m / (sr / n), m / (sg / n), m / (sb / n)].map((g) =>
        Math.min(1.12, Math.max(0.9, g)),
      )
    }
    // 明るさの幅: 0.2% 点を黒、99.6% 点を白に近づける（半分だけ）
    const lums: number[] = []
    for (const t of all)
      for (let i = 0; i < t.d.length; i += 15)
        lums.push(
          0.299 * t.d[i] * gains[0] +
            0.587 * t.d[i + 1] * gains[1] +
            0.114 * t.d[i + 2] * gains[2],
        )
    lums.sort((a, b) => a - b)
    const bp = Math.max(0, Math.min(40, lums[Math.floor(lums.length * 0.002)]))
    const wp = Math.min(
      255,
      Math.max(200, lums[Math.floor(lums.length * 0.996)]),
    )
    const lev = (v: number) => v * 0.5 + ((v - bp) / (wp - bp)) * 255 * 0.5
    for (const t of all)
      for (let i = 0; i < t.d.length; i += 3) {
        let r = lev(t.d[i] * gains[0])
        let g = lev(t.d[i + 1] * gains[1])
        let b = lev(t.d[i + 2] * gains[2])
        // 彩度を少し上げる
        const l = 0.299 * r + 0.587 * g + 0.114 * b
        r = l + (r - l) * 1.07
        g = l + (g - l) * 1.07
        b = l + (b - l) * 1.07
        t.d[i] = r
        t.d[i + 1] = g
        t.d[i + 2] = b
      }
  }
  if (sideDetail < 1) softenLowerDetail(tex.side, sideDetail)
  // 側面を少し暗くして立体に見せる
  for (const [t, k] of [
    [tex.front, 1],
    [tex.top, 1],
    [tex.side, 0.95],
  ] as const)
    for (let i = 0; i < t.d.length; i++)
      t.d[i] = Math.min(255, Math.max(0, t.d[i] * k))

  // 平行投影で組み立てる（x 右・y 下・z 奥。カメラは右上の手前）
  const ex: V3 = [Math.cos(yaw), 0, Math.sin(yaw)]
  const ey: V3 = [
    Math.sin(pitch) * Math.sin(yaw),
    Math.cos(pitch),
    -Math.sin(pitch) * Math.cos(yaw),
  ]
  const P: Record<string, V3> = {
    FTL: [0, 0, 0],
    FTR: [BW, 0, 0],
    FBR: [BW, 1, 0],
    FBL: [0, 1, 0],
    BTL: [0, 0, BD],
    BTR: [BW, 0, BD],
    BBR: [BW, 1, BD],
    BBL: [0, 1, BD],
  }
  const scr0 = Object.fromEntries(
    Object.entries(P).map(([k, p]) => [k, { x: dot(p, ex), y: dot(p, ey) }]),
  )
  const hexK = ['FTL', 'BTL', 'BTR', 'BBR', 'FBR', 'FBL']
  const bxs = hexK.map((k) => scr0[k].x)
  const bys = hexK.map((k) => scr0[k].y)
  const boxH = Math.max(...bys) - Math.min(...bys)
  const minX = Math.min(...bxs) - boxH * 0.06
  const maxX = Math.max(...bxs) + boxH * 0.06
  const minY = Math.min(...bys) - boxH * 0.03
  const maxY = Math.max(...bys) + boxH * 0.07
  const sc = maxSide / Math.max(maxX - minX, maxY - minY)
  const OW = Math.round((maxX - minX) * sc)
  const OH = Math.round((maxY - minY) * sc)
  const scr = Object.fromEntries(
    Object.entries(scr0).map(([k, p]) => [
      k,
      { x: (p.x - minX) * sc, y: (p.y - minY) * sc },
    ]),
  )
  const faces = (
    [
      [tex.front, ['FTL', 'FTR', 'FBR', 'FBL'], 0.004],
      [tex.top, ['BTL', 'BTR', 'FTR', 'FTL'], 0.012],
      [tex.side, ['FTR', 'BTR', 'BBR', 'FBR'], 0.012],
    ] as const
  ).map(([t, q, inset]) => {
    const p0 = scr[q[0]]
    const p1 = scr[q[1]]
    const p3 = scr[q[3]]
    const a = { x: p1.x - p0.x, y: p1.y - p0.y }
    const b = { x: p3.x - p0.x, y: p3.y - p0.y }
    const det = a.x * b.y - a.y * b.x
    return {
      t,
      p0,
      inset,
      inv: [
        [b.y / det, -b.x / det],
        [-a.y / det, a.x / det],
      ],
    }
  })
  const sampleTex = (t: Tex, s: number, u: number, out: number[]) => {
    const x = Math.min(t.w - 1.001, Math.max(0, s * t.w - 0.5))
    const y = Math.min(t.h - 1.001, Math.max(0, u * t.h - 0.5))
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    const i00 = (y0 * t.w + x0) * 3
    const i10 = i00 + 3
    const i01 = i00 + t.w * 3
    const i11 = i01 + 3
    for (let k = 0; k < 3; k++)
      out[k] =
        (t.d[i00 + k] * (1 - fx) + t.d[i10 + k] * fx) * (1 - fy) +
        (t.d[i01 + k] * (1 - fx) + t.d[i11 + k] * fx) * fy
  }
  const SS = 3
  const rgb = new Float32Array(OW * OH * 3)
  const alpha = new Float32Array(OW * OH)
  const px = [0, 0, 0]
  for (let py = 0; py < OH; py++)
    for (let qx0 = 0; qx0 < OW; qx0++) {
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const qx = qx0 + (sx + 0.5) / SS
          const qy = py + (sy + 0.5) / SS
          for (const f of faces) {
            const dx = qx - f.p0.x
            const dy = qy - f.p0.y
            const s = f.inv[0][0] * dx + f.inv[0][1] * dy
            const u = f.inv[1][0] * dx + f.inv[1][1] * dy
            if (s < 0 || s > 1 || u < 0 || u > 1) continue
            const m = f.inset
            sampleTex(f.t, m + s * (1 - 2 * m), m + u * (1 - 2 * m), px)
            r += px[0]
            g += px[1]
            b += px[2]
            n++
            break
          }
        }
      if (!n) continue
      const i = py * OW + qx0
      rgb[i * 3] = r / n
      rgb[i * 3 + 1] = g / n
      rgb[i * 3 + 2] = b / n
      alpha[i] = n / (SS * SS)
    }

  // 影: 箱の底の形を少し広げて下にずらし、ぼかす（近い影と、薄く広い影の 2 つ）
  const foot = ['FBL', 'FBR', 'BBR', 'BBL'].map((k) => scr[k])
  const fcx = foot.reduce((s, p) => s + p.x, 0) / 4
  const fcy = foot.reduce((s, p) => s + p.y, 0) / 4
  const boxPx = boxH * sc
  const shadowOf = (
    expand: number,
    shift: number,
    sigma: number,
    opacity: number,
  ) => {
    const poly = foot.map((p) => ({
      x: fcx + (p.x - fcx) * expand,
      y: fcy + (p.y - fcy) * expand + shift * boxPx,
    }))
    const m = new Float32Array(OW * OH)
    let area = 0
    for (let i = 0; i < 4; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % 4]
      area += a.x * b.y - b.x * a.y
    }
    const sg = area > 0 ? 1 : -1
    for (let y = 0; y < OH; y++)
      for (let x = 0; x < OW; x++) {
        let inside = true
        for (let i = 0; i < 4; i++) {
          const a = poly[i]
          const b = poly[(i + 1) % 4]
          if (
            ((b.x - a.x) * (y + 0.5 - a.y) - (b.y - a.y) * (x + 0.5 - a.x)) *
              sg <
            0
          ) {
            inside = false
            break
          }
        }
        if (inside) m[y * OW + x] = 1
      }
    return {
      bl: blurMask(m, OW, OH, Math.max(0.5, sigma * boxPx)),
      opacity: opacity * shadow,
    }
  }
  const shadows =
    shadow > 0
      ? [shadowOf(1.02, 0.008, 0.012, 0.42), shadowOf(1.12, 0.02, 0.045, 0.2)]
      : []
  const out = new Uint8ClampedArray(OW * OH * 4)
  for (let i = 0; i < OW * OH; i++) {
    let sh = 0
    for (const s of shadows) sh = 1 - (1 - sh) * (1 - s.bl[i] * s.opacity)
    const ba = alpha[i]
    const oa = ba + sh * (1 - ba)
    if (oa <= 0) continue
    out[i * 4] = (rgb[i * 3] * ba) / oa
    out[i * 4 + 1] = (rgb[i * 3 + 1] * ba) / oa
    out[i * 4 + 2] = (rgb[i * 3 + 2] * ba) / oa
    out[i * 4 + 3] = oa * 255
  }
  return {
    data: out,
    width: OW,
    height: OH,
    dims: { width: BW, depth: BD },
    aspects: est.aspects,
  }
}
