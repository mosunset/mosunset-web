// 今の TS の計算（box-packing/solver.ts）で、同じ並べ方を評価する・速さを測る。Node 23.6 以上で型を外して動かす
//   node tools/ts-ref.ts eval <input.json> <genomes.json>
//   node tools/ts-ref.ts bench <input.json> <seconds>
import { readFileSync } from 'node:fs'
import {
  createSearch,
  evaluateGenome,
  type Genome,
  type PackInput,
} from '../../../src/components/playground/tools/box-packing/solver.ts'

const [cmd, inputPath, arg] = process.argv.slice(2)
const input = JSON.parse(readFileSync(inputPath, 'utf8')) as PackInput

if (cmd === 'eval') {
  const genomes = JSON.parse(readFileSync(arg, 'utf8')) as Genome[]
  const t = performance.now()
  const out = genomes.map((g) => {
    const r = evaluateGenome(input, g)
    return {
      score: r.score,
      height: r.height,
      tidiness: r.tidiness,
      fillRate: r.fillRate,
      placements: r.placements.length,
      unplaced: r.unplaced.reduce((s, u) => s + u.count, 0),
    }
  })
  console.error(`TS: ${genomes.length} 通りを ${(performance.now() - t).toFixed(1)} ms`)
  console.log(JSON.stringify(out))
} else if (cmd === 'bench') {
  const seconds = Number(arg ?? 10)
  const search = createSearch(input)
  const t = performance.now()
  while (performance.now() - t < seconds * 1000) {
    for (let i = 0; i < 16; i++) search.step()
  }
  const el = (performance.now() - t) / 1000
  console.log(
    `TS（Node・1 スレッド）: ${(search.tried / el).toFixed(0)} 通り/秒（いちばん良い点数 ${search.best.score.toFixed(4)}・高さ ${search.best.height}）`,
  )
}
