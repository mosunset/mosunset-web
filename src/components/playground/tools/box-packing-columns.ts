/**
 * 箱詰めの「柱で積む」方式（仕様は box-packing-spec.tsx）。
 * 底面が近い箱を縦に積んだ柱を作り、柱を奥（壁側）の列から床に並べる。高さの目標 H を決め、
 * すべての柱を H 以下にして床に収まれば成功。収まる H をできるだけ低く探しつつ、
 * 柱の組み方・列の分け方を少しずつ変えた結果をたくさん出す（点数の付け方は並べ順の方式と同じ）。
 */
import {
  anchorOf,
  evaluatePlacements,
  type FaceLabel,
  fitsFloor,
  type Genome,
  orientationsOf,
  type PackInput,
  type PackResult,
  type Placement,
  random,
  type Unplaced,
} from './box-packing-solver'

/** 底面が近いとみなす幅（縦・横それぞれ、mm） */
const FOOT_TOL = 10
/** 収まらなかったときに、高さの目標を上げる幅（mm） */
const H_STEP = 10
/** 1 つの高さの目標で、何回試してだめなら上げるか */
const TRIES_PER_H = 40

type Opt = {
  w: number
  d: number
  h: number
  faces: FaceLabel[]
  laidDown: boolean
}
type Box = { type: number; rank: number; opts: Opt[] }
type Item = { box: Box; o: Opt }
type Column = { items: Item[]; w: number; d: number; h: number; rank: number }

/** 箱の置き方の一覧（寸法と横倒しが同じものは 1 つ。正面が手前を向く向きを優先） */
function optionsOf(input: PackInput, type: number): Opt[] {
  const box = input.boxes[type]
  const out = new Map<string, Opt>()
  for (const o of orientationsOf(box, true)) {
    const key = `${o.w}x${o.d}x${o.h}:${o.laidDown}`
    const prev = out.get(key)
    if (!prev || (prev.faces[3] !== '前' && o.faces[3] === '前'))
      out.set(key, o)
  }
  return [...out.values()]
}

/** 上の箱が、下の箱にどれだけ支えられるか（手前と左をそろえて積むとき）が足りるか */
function supported(lower: Opt, upper: Opt, percent: number) {
  const area = Math.min(lower.w, upper.w) * Math.min(lower.d, upper.d)
  return area * 100 >= percent * upper.w * upper.d
}

/** 柱の中を下から大きい順に並べ、支えが足りない箱を外す（外した箱を返す） */
function settle(items: Item[], percent: number) {
  const sorted = [...items].sort(
    (a, b) => b.o.w * b.o.d - a.o.w * a.o.d || b.o.h - a.o.h,
  )
  const kept: Item[] = []
  const dropped: Item[] = []
  for (const it of sorted) {
    const top = kept[kept.length - 1]
    if (!top || supported(top.o, it.o, percent)) kept.push(it)
    else dropped.push(it)
  }
  return { kept, dropped }
}

const columnOf = (items: Item[]): Column => ({
  items,
  w: Math.max(...items.map((it) => it.o.w)),
  d: Math.max(...items.map((it) => it.o.d)),
  h: items.reduce((a, it) => a + it.o.h, 0),
  rank: items.reduce((a, it) => a + it.box.rank, 0) / items.length,
})

/**
 * 高さの合計が cap 以下で、できるだけ cap に近くなる組み合わせ（部分和問題を動的計画法で解く）。
 * 選んだ番号を返す
 */
function bestSubset(heights: number[], cap: number) {
  if (cap <= 0 || heights.length === 0) return []
  const from = new Int32Array(cap + 1).fill(-2)
  from[0] = -1
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i]
    for (let s = cap; s >= h; s--) {
      if (from[s] === -2 && from[s - h] !== -2 && from[s - h] !== i) {
        from[s] = i
      }
    }
  }
  let s = cap
  while (s > 0 && from[s] === -2) s--
  const picked: number[] = []
  // 同じ番号を 2 度使わないよう、たどりながら確かめる
  const used = new Set<number>()
  while (s > 0) {
    const i = from[s]
    if (i < 0 || used.has(i)) break
    used.add(i)
    picked.push(i)
    s -= heights[i]
  }
  return picked
}

export function createColumnSearch(
  input: PackInput,
  onResult?: (result: PackResult) => void,
) {
  const U = input.floorX - 2 * input.edgeGap
  const V = input.floorY - 2 * input.edgeGap
  const { gap, supportPercent: percent, walls, tidy } = input
  const anchor = anchorOf(walls)
  const { floorX: X, floorY: Y, edgeGap: e } = input
  const rand = random(input.seed * 104729 + 17)

  // 置く箱（1 個ずつ）と、どの向きでも床からはみ出す箱
  const tooBig: Unplaced[] = []
  const boxes: Box[] = []
  const present = input.boxes
    .map((b, t) => (b.count > 0 && fitsFloor(b, input) ? t : -1))
    .filter((t) => t >= 0)
  const rankOf = new Map(
    present.map((t, i) => [t, i / Math.max(1, present.length - 1)]),
  )
  input.boxes.forEach((box, type) => {
    if (box.count <= 0) return
    if (!fitsFloor(box, input)) {
      tooBig.push({ type, count: box.count, reason: 'too-big' })
      return
    }
    const opts = optionsOf(input, type).filter((o) => o.w <= U && o.d <= V)
    for (let i = 0; i < box.count; i++)
      boxes.push({ type, rank: rankOf.get(type) ?? 0, opts })
  })

  // 高さの目標の下限: いちばん低く置ける向きでも、いちばん背の高い箱の高さ。全部を床に流したときの高さ
  const minH = Math.max(
    1,
    ...boxes.map((b) => Math.min(...b.opts.map((o) => o.h))),
    Math.ceil(
      boxes.reduce((a, b) => a + b.opts[0].w * b.opts[0].d * b.opts[0].h, 0) /
        Math.max(1, U * V),
    ),
  )
  const preferUpright = tidy.weight > 0 && tidy.upright

  /** 高さの目標 H で、柱を作って床に並べる（1 回分。ゆらぎを入れて毎回少し違う形にする） */
  const build = (H: number) => {
    // 1. 向き: そのままを優先し、ときどき横倒し（背が低くなる向き）も選ぶ
    const layChance = preferUpright ? rand() * 0.15 : rand() * 0.6
    const items: Item[] = []
    for (const box of boxes) {
      const ok = box.opts.filter((o) => o.h <= H)
      if (ok.length === 0) return null
      const upright = ok.filter((o) => !o.laidDown)
      const pool = upright.length > 0 && rand() >= layChance ? upright : ok
      items.push({ box, o: pool[Math.floor(rand() * pool.length)] })
    }

    // 2. 底面が近い箱のまとまり（大きい順。少しゆらぎを入れる）
    items.sort(
      (a, b) =>
        b.o.w * b.o.d * (0.9 + rand() * 0.2) -
        a.o.w * a.o.d * (0.9 + rand() * 0.2),
    )
    const classes: Item[][] = []
    for (const it of items) {
      const near = (c: Item[]) =>
        Math.abs(c[0].o.w - it.o.w) <= FOOT_TOL &&
        Math.abs(c[0].o.d - it.o.d) <= FOOT_TOL
      let c = classes.find(near)
      if (!c) {
        // 床の上で 90° 回すと近いまとまりがあれば、回した向きで入れる
        const turned = it.box.opts.find(
          (o) =>
            o.w === it.o.d &&
            o.d === it.o.w &&
            o.h === it.o.h &&
            o.laidDown === it.o.laidDown,
        )
        if (turned) {
          const t = { box: it.box, o: turned }
          c = classes.find(
            (k) =>
              Math.abs(k[0].o.w - t.o.w) <= FOOT_TOL &&
              Math.abs(k[0].o.d - t.o.d) <= FOOT_TOL,
          )
          if (c) {
            c.push(t)
            continue
          }
        }
        classes.push([it])
      } else c.push(it)
    }

    // 3. まとまりごとに、高さの合計が H に近くなるよう柱を組む
    let columns: Column[] = []
    for (const cls of classes) {
      let rest = [...cls].sort(
        (a, b) => b.o.h - a.o.h || (tidy.near ? a.box.rank - b.box.rank : 0),
      )
      while (rest.length > 0) {
        const [first, ...others] = rest
        // ときどき候補から外して、違う組み方も試す
        const pool = others.filter(() => rand() > 0.08)
        const picked = bestSubset(
          pool.map((it) => it.o.h),
          H - first.o.h,
        ).map((i) => pool[i])
        const { kept } = settle([first, ...picked], percent)
        const used = new Set(kept)
        columns.push(columnOf(kept))
        // 柱に入れた箱を除く（支えが足りずに外した箱は、残りに戻って次の柱に入る）
        rest = rest.filter((it) => !used.has(it))
      }
    }

    // 4. 箱 1 個だけの柱は、ほかの柱の上に載せられれば載せる（高さの合計が H に近くなるところへ）
    const singles = columns
      .filter((c) => c.items.length === 1)
      .sort((a, b) => a.h - b.h)
    for (const single of singles) {
      // ほかの箱が載って 1 個でなくなった柱は、そのまま
      if (single.items.length !== 1) continue
      const it = single.items[0]
      let target: Column | null = null
      for (const c of columns) {
        if (c === single || c.items.length === 0) continue
        if (c.h + it.o.h > H) continue
        if (!supported(c.items[c.items.length - 1].o, it.o, percent)) continue
        if (!target || c.h > target.h) target = c
      }
      if (target) {
        target.items.push(it)
        target.h += it.o.h
        target.rank =
          target.items.reduce((a, x) => a + x.box.rank, 0) / target.items.length
        single.items = []
      }
    }
    columns = columns.filter((c) => c.items.length > 0)

    // 5. 列に分ける: 背の高い柱から順に、奥行きの増え方がいちばん小さい列へ（入らなければ新しい列）
    const order = [...columns].sort(
      (a, b) => b.h * (0.9 + rand() * 0.2) - a.h * (0.9 + rand() * 0.2),
    )
    type Row = { cols: Column[]; width: number; depth: number }
    const rows: Row[] = []
    for (const c of order) {
      let best: Row | null = null
      let bestGrow = Number.POSITIVE_INFINITY
      for (const r of rows) {
        if (r.width + gap + c.w > U) continue
        const grow = Math.max(r.depth, c.d) - r.depth
        if (grow < bestGrow) {
          bestGrow = grow
          best = r
        }
      }
      if (best && bestGrow <= c.d * 0.3) {
        best.cols.push(c)
        best.width += gap + c.w
        best.depth = Math.max(best.depth, c.d)
      } else rows.push({ cols: [c], width: c.w, depth: c.d })
    }

    // 6. 列の中の順番: 横の壁が片側だけなら背の高い柱を壁側から、そうでなければ真ん中を高く（左右の釣り合い）。
    //    リストで近い箱を近くにするときは、並び順でそろえる
    const sideWall = walls.left !== walls.right
    for (const r of rows) {
      if (tidy.weight > 0 && tidy.near && rand() < 0.5) {
        r.cols.sort((a, b) => a.rank - b.rank)
      } else if (sideWall) {
        r.cols.sort((a, b) => b.h - a.h)
      } else {
        const desc = [...r.cols].sort((a, b) => b.h - a.h)
        const arranged: Column[] = []
        desc.forEach((c, i) => {
          if (i % 2 === 0) arranged.push(c)
          else arranged.unshift(c)
        })
        r.cols = arranged
      }
    }

    // 7. 置く: 奥の列から。柱は列の手前の面にそろえ、柱の中の箱も手前と左をそろえる
    const placements: Placement[] = []
    const unplacedTypes: number[] = []
    let v = 0
    let height = 0
    for (const r of rows) {
      const fits = v + r.depth <= V
      let u = 0
      for (const c of r.cols) {
        if (!fits) {
          for (const it of c.items) unplacedTypes.push(it.box.type)
          continue
        }
        let z = 0
        // 奥に壁があるとき（v を奥から数える）は、v の大きい側が手前
        const colV = anchor.fromBack ? v + r.depth - c.d : v
        for (const it of c.items) {
          const o = it.o
          const bu = u
          const bv = anchor.fromBack ? colV + c.d - o.d : colV
          placements.push({
            type: it.box.type,
            x: anchor.fromRight ? X - e - bu - o.w : e + bu,
            y: anchor.fromBack ? Y - e - bv - o.d : e + bv,
            z,
            w: o.w,
            d: o.d,
            h: o.h,
            faces: o.faces,
            laidDown: o.laidDown,
          })
          z += o.h
        }
        height = Math.max(height, z)
        u += c.w + gap
      }
      if (fits) v += r.depth + gap
    }
    return {
      result: evaluatePlacements(
        placements,
        unplacedTypes,
        height,
        input,
        tooBig,
      ),
      fits: unplacedTypes.length === 0,
    }
  }

  let H = minH
  let feasibleH = Number.POSITIVE_INFINITY
  let triesAtH = 0
  let tried = 0
  let best: PackResult | null = null

  const step = () => {
    // 収まる高さが見つかるまでは、H を少しずつ上げる。見つかったあとは、その前後の高さでいろいろな形を出す
    let target = H
    if (Number.isFinite(feasibleH)) {
      const r = rand()
      target =
        r < 0.35
          ? feasibleH - H_STEP
          : r < 0.7
            ? feasibleH
            : feasibleH + H_STEP * (1 + Math.floor(rand() * 4))
    }
    tried++
    const built = build(Math.max(minH, target))
    if (!built) {
      H += H_STEP
      return false
    }
    onResult?.(built.result)
    if (built.fits) feasibleH = Math.min(feasibleH, built.result.height)
    else if (!Number.isFinite(feasibleH) && ++triesAtH >= TRIES_PER_H) {
      H += H_STEP
      triesAtH = 0
    }
    if (!best || built.result.score < best.score - 1e-9) {
      best = built.result
      return true
    }
    return false
  }
  step()

  return {
    get best() {
      return best as PackResult
    },
    get tried() {
      return tried
    },
    get exhausted() {
      return boxes.length === 0
    },
    step,
    /** 並べ順の方式の並べ方は使えないので、受け取らない */
    adopt(_genome?: Genome) {
      return false
    },
  }
}
