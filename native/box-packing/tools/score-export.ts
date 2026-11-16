// サイト・画面で書き出した JSON（settings と result）の置き方を、今の TS の点数の付け方で採点し直す。
// 書き出しには genome が無いので、置き方（位置・寸法・上の面）から箱の種類と向きを復元して evaluatePlacements に渡す。
//   node tools/score-export.ts <書き出した.json> [<solve の結果.json>]
import { readFileSync } from 'node:fs'
import {
  evaluatePlacements,
  orientationsOf,
  type BoxSpec,
  type PackInput,
  type Placement,
} from '../../../src/components/playground/tools/box-packing/solver.ts'

type Exported = {
  settings: Omit<PackInput, 'seed' | 'boxes'> & {
    boxes: (BoxSpec & { enabled?: boolean })[]
  }
  result?: {
    placements: {
      tag: string
      x: number
      y: number
      z: number
      w: number
      d: number
      h: number
      upFace: string
    }[]
  }
}

const [exportPath, solvedPath] = process.argv.slice(2)
const data = JSON.parse(readFileSync(exportPath, 'utf8')) as Exported
const input: PackInput = {
  ...data.settings,
  boxes: data.settings.boxes.filter((b) => b.enabled !== false),
  seed: 1,
}

// 箱の種類ごとの残り数（同じタグが何種類かあっても、寸法が合うものを先に使う）
const left = input.boxes.map((b) => b.count)
const typeOf = (tag: string, w: number, d: number, h: number) => {
  const dims = [w, d, h].sort((a, b) => a - b).join('x')
  const i = input.boxes.findIndex(
    (b, k) =>
      left[k] > 0 &&
      b.tag === tag &&
      [b.x, b.y, b.z].sort((a, b) => a - b).join('x') === dims,
  )
  if (i < 0) throw new Error(`箱が見つかりません: ${tag} ${w}x${d}x${h}`)
  left[i]--
  return i
}

const score = (label: string, placements: Placement[]) => {
  const height = Math.max(0, ...placements.map((p) => p.z + p.h))
  const r = evaluatePlacements(placements, [], height, input, [])
  console.log(
    `${label}: 点数 ${r.score.toFixed(4)}・高さ ${r.height} mm・整い ${r.tidiness.toFixed(3)}・充填率 ${(r.fillRate * 100).toFixed(1)}%`,
  )
}

if (data.result) {
  const placements = data.result.placements.map((p): Placement => {
    const type = typeOf(p.tag, p.w, p.d, p.h)
    const os = orientationsOf(input.boxes[type], true).filter(
      (o) => o.w === p.w && o.d === p.d && o.h === p.h && o.faces[4] === p.upFace,
    )
    if (os.length === 0) throw new Error(`向きが見つかりません: ${p.tag}`)
    // 正面（-Y を向く面、faces[3]）が「前」の向きがあればそれ（書き出しには上の面しか残らないため）
    const o = os.find((x) => x.faces[3] === '前') ?? os[0]
    return { type, x: p.x, y: p.y, z: p.z, w: p.w, d: p.d, h: p.h, faces: o.faces, laidDown: o.laidDown }
  })
  score('書き出しの結果', placements)
}
if (solvedPath) {
  const solved = JSON.parse(readFileSync(solvedPath, 'utf8')) as { placements: Placement[] }
  score('solve の結果', solved.placements)
}
