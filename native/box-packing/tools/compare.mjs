// Rust と TS の評価結果（eval の出力）を比べる
import { readFileSync } from 'node:fs'
const a = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const b = JSON.parse(readFileSync(process.argv[3], 'utf8'))
let bad = 0
let maxDiff = 0
for (let i = 0; i < a.length; i++) {
  const d = Math.abs(a[i].score - b[i].score)
  maxDiff = Math.max(maxDiff, d)
  const same = d < 1e-9 && a[i].height === b[i].height && a[i].placements === b[i].placements && a[i].unplaced === b[i].unplaced && Math.abs(a[i].tidiness - b[i].tidiness) < 1e-12
  if (!same) {
    bad++
    if (bad <= 5) console.log('違う', i, JSON.stringify(a[i]), JSON.stringify(b[i]))
  }
}
console.log(`${a.length} 通り中、食い違い ${bad}（点数の差の最大 ${maxDiff}）`)
