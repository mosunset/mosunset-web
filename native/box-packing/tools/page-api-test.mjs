// ネイティブ版のページ向けの窓口（/api/hello・/api/page/*）を、ページと同じ形で試す。
// 先に `box-packing serve --no-open` を動かしておく。
//   node tools/page-api-test.mjs <入力.json（サイトの書き出しでもよい）> [秒]
import { readFileSync } from 'node:fs'

const base = 'http://127.0.0.1:8787'
const origin = 'https://mosunset.com'
const [path, secArg] = process.argv.slice(2)
const data = JSON.parse(readFileSync(path, 'utf8'))
const s = data.settings ?? data
const input = { ...s, boxes: s.boxes.filter((b) => b.enabled !== false), seed: 1 }
const seconds = Number(secArg ?? 10)

const headers = { Origin: origin, 'Content-Type': 'application/json' }
const hello = await fetch(`${base}/api/hello`, { headers })
console.log('hello', hello.status, hello.headers.get('access-control-allow-origin'), await hello.text())

const bad = await fetch(`${base}/api/hello`, { headers: { Origin: 'https://example.com' } })
console.log('ほかのサイト', bad.status)

const pre = await fetch(`${base}/api/page/run`, {
  method: 'OPTIONS',
  headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Private-Network': 'true' },
})
console.log('preflight', pre.status, pre.headers.get('access-control-allow-private-network'))

const token = 42
const run = await fetch(`${base}/api/page/run`, { method: 'POST', headers, body: JSON.stringify({ token, input }) })
console.log('run', run.status, await run.text())

let b = 0
let m = [0, 0, 0]
const t0 = Date.now()
while (Date.now() - t0 < seconds * 1000) {
  await new Promise((r) => setTimeout(r, 500))
  const p = await (await fetch(`${base}/api/page/poll?token=${token}&b=${b}&m=${m.join(',')}`, { headers })).json()
  if (p.best) b = p.best.v
  p.metrics.forEach((x, i) => {
    if (x) m[i] = x.v
  })
  const got = [p.best ? `best ${p.best.result.score.toFixed(4)}/${p.best.result.height}mm genome:${!!p.best.result.genome}` : '', ...p.metrics.map((x) => (x ? `${x.metric} ${x.result.height}mm genome:${!!x.result.genome}` : ''))].filter(Boolean)
  console.log(`${(p.elapsed / 1000).toFixed(1)}s tried ${p.tried} gpu ${p.gpu} done ${p.done}`, got.join(' | '))
}
const stop = await fetch(`${base}/api/page/stop`, { method: 'POST', headers, body: JSON.stringify({ token }) })
console.log('stop', stop.status)
await new Promise((r) => setTimeout(r, 500))
const after = await (await fetch(`${base}/api/page/poll?token=${token}&b=${b}&m=${m.join(',')}`, { headers })).json()
console.log('止めたあと done', after.done)
const other = await (await fetch(`${base}/api/page/poll?token=7`, { headers })).json()
console.log('違う番号', JSON.stringify(other))
