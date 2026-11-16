// 柱で積む方式の確かめ: ネイティブ版の結果（solve --out）の置き方を TS で採点し直して点数が同じか、
// また TS の柱で積む方式を同じ秒数（1 スレッド）動かしたときの結果と比べる。
//   node tools/columns-check.ts <入力.json（method: "columns"）> <solve の結果.json> [秒]
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  evaluatePlacements,
  fitsFloor,
  type PackInput,
  type PackResult,
  type Unplaced,
} from '../../../src/components/playground/tools/box-packing/solver.ts'

const [inputPath, solvedPath, secArg] = process.argv.slice(2)
const input = JSON.parse(readFileSync(inputPath, 'utf8')) as PackInput
const solved = JSON.parse(readFileSync(solvedPath, 'utf8')) as PackResult

const tooBig: Unplaced[] = input.boxes.flatMap((b, type) =>
  b.count > 0 && !fitsFloor(b, input)
    ? [{ type, count: b.count, reason: 'too-big' as const }]
    : [],
)
const unplacedTypes = solved.unplaced
  .filter((u) => u.reason !== 'too-big')
  .flatMap((u) => Array<number>(u.count).fill(u.type))
const again = evaluatePlacements(
  solved.placements,
  unplacedTypes,
  solved.height,
  input,
  tooBig,
)
console.log(
  `ネイティブの結果: 点数 ${solved.score.toFixed(6)} → TS で採点し直すと ${again.score.toFixed(6)}（差 ${Math.abs(again.score - solved.score).toExponential(1)}）・高さ ${solved.height} mm・箱 ${solved.placements.length} 個`,
)

// columns.ts は拡張子なしで './solver' を読むので Node では読めない。一時フォルダーに読み先を直した写しを作って読む
const src = new URL(
  '../../../src/components/playground/tools/box-packing/',
  import.meta.url,
)
const copy = pathToFileURL(
  join(mkdtempSync(join(tmpdir(), 'box-packing-')), 'columns.ts'),
)
writeFileSync(
  copy,
  readFileSync(new URL('columns.ts', src), 'utf8').replace(
    "from './solver'",
    `from '${new URL('solver.ts', src).href}'`,
  ),
)
const { createColumnSearch } = (await import(
  copy.href
)) as typeof import('../../../src/components/playground/tools/box-packing/columns')

const seconds = Number(secArg ?? 10)
const search = createColumnSearch(input)
const t0 = performance.now()
while (performance.now() - t0 < seconds * 1000) search.step()
const b = search.best
console.log(
  `TS（1 スレッド・${seconds} 秒・${search.tried} 回）: 点数 ${b.score.toFixed(4)}・高さ ${b.height} mm・整い ${b.tidiness.toFixed(3)}`,
)
