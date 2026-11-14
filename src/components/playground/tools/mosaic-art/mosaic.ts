/**
 * モザイクアートの計算のうち、画面と Worker の両方で使うもの。
 * 色は「タイルを縦横 2×2 に分けた 4 か所の平均色」を OKLab（人の目の差に近い色の表し方）で持ち、
 * 12 個の数の近さでタイルを選ぶ。1 色の平均だけで選ぶより、明暗の向き（上が明るい・左が暗いなど）まで合う。
 */

/** 素材のタイルを持っておく大きさ（px）。書き出しのタイルはこれより大きくしない */
export const TILE_PX = 96

/** 1 タイルの特徴の数（2×2 の 4 か所 × OKLab の 3 つ） */
export const FEATURES = 12

/** 書き出す画像の面積の上限（Safari の canvas の上限に合わせる） */
export const MAX_AREA = 16_777_216

const toLinear = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** sRGB（0〜255）を OKLab にして out[at..at+2] に書く */
export function writeOklab(
  r: number,
  g: number,
  b: number,
  out: Float32Array,
  at: number,
) {
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  out[at] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  out[at + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  out[at + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
}

/**
 * 画像の (x, y, w, h) の範囲を 2×2 に分け、4 か所の平均色を OKLab で out[at..at+11] に書く。
 * 並びは 左上・右上・左下・右下
 */
export function writeRegionFeatures(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  w: number,
  h: number,
  out: Float32Array,
  at: number,
) {
  const hw = w / 2
  const hh = h / 2
  for (let q = 0; q < 4; q++) {
    const x0 = Math.round(x + (q % 2) * hw)
    const x1 = Math.round(x + ((q % 2) + 1) * hw)
    const y0 = Math.round(y + Math.floor(q / 2) * hh)
    const y1 = Math.round(y + (Math.floor(q / 2) + 1) * hh)
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * width + xx) * 4
        r += data[i]
        g += data[i + 1]
        b += data[i + 2]
        n++
      }
    }
    if (n === 0) n = 1
    writeOklab(r / n, g / n, b / n, out, at + q * 3)
  }
}

/** 左右反転したタイルの特徴（左右の入れ替え） */
export function mirrorFeatures(f: Float32Array): Float32Array {
  const out = new Float32Array(FEATURES)
  const order = [1, 0, 3, 2]
  for (let q = 0; q < 4; q++) {
    out.set(f.subarray(order[q] * 3, order[q] * 3 + 3), q * 3)
  }
  return out
}

/** 同じ種なら同じ並びになる乱数（並べる順番を決めるのに使う） */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type MatchInput = {
  /** マスごとの特徴（マスの数 × FEATURES） */
  cells: Float32Array
  /** タイルの候補ごとの特徴（候補の数 × FEATURES）。左右反転を使うときは後ろ半分が反転 */
  tiles: Float32Array
  /** 元の写真の数。候補の番号 % sources が写真の番号になる */
  sources: number
  cols: number
  rows: number
  /** この距離（マス）以内には同じ写真を置かない。0 なら制限なし */
  radius: number
  seed: number
}

/**
 * マスごとに、いちばん色の近いタイルを選ぶ。
 * 近くのマスと同じ写真にならないよう、マスを乱数の順に埋め、すでに埋まった近くのマスの写真は避ける
 * （上から順に埋めると、避け方の癖が縞になって見えるため）。
 * 戻り値はマスごとのタイルの候補の番号
 */
export function matchTiles(
  input: MatchInput,
  onProgress?: (done: number) => void,
): Int32Array {
  const { cells, tiles, sources, cols, rows, radius, seed } = input
  const count = cols * rows
  const candidates = tiles.length / FEATURES
  const assignment = new Int32Array(count).fill(-1)
  const order = new Int32Array(count)
  for (let i = 0; i < count; i++) order[i] = i
  const random = mulberry32(seed)
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const t = order[i]
    order[i] = order[j]
    order[j] = t
  }

  const dist = new Float32Array(candidates)
  const banned: number[] = []
  for (let k = 0; k < count; k++) {
    const cell = order[k]
    const base = cell * FEATURES
    for (let t = 0; t < candidates; t++) {
      const tb = t * FEATURES
      let d = 0
      for (let f = 0; f < FEATURES; f++) {
        const diff = cells[base + f] - tiles[tb + f]
        d += diff * diff
      }
      dist[t] = d
    }

    banned.length = 0
    if (radius > 0) {
      const cx = cell % cols
      const cy = Math.floor(cell / cols)
      for (
        let y = Math.max(0, cy - radius);
        y <= Math.min(rows - 1, cy + radius);
        y++
      ) {
        for (
          let x = Math.max(0, cx - radius);
          x <= Math.min(cols - 1, cx + radius);
          x++
        ) {
          const a = assignment[y * cols + x]
          if (a >= 0) banned.push(a % sources)
        }
      }
    }

    // 近くにない写真のうち、いちばん近い色のもの。全部近くにあるときは、いちばん近い色のもの
    let best = -1
    let bestD = Infinity
    let fallback = 0
    let fallbackD = Infinity
    for (let t = 0; t < candidates; t++) {
      const d = dist[t]
      if (d < fallbackD) {
        fallbackD = d
        fallback = t
      }
      if (d < bestD && !banned.includes(t % sources)) {
        bestD = d
        best = t
      }
    }
    assignment[cell] = best >= 0 ? best : fallback
    if (onProgress && (k + 1) % 2000 === 0) onProgress(k + 1)
  }
  return assignment
}
