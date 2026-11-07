/**
 * ローカル（wrangler の開発用 R2）にある画像のうち、データベースから使われているものを本番の R2 に送る。
 * 記事とコレクションを本番の D1 に入れたあとに 1 度だけ使う想定。すでにあるものは上書きする。
 *
 * 使い方: node scripts/push-images-to-remote.mts
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { getPlatformProxy } from 'wrangler'

const BUCKET = 'mosunset-web-images'

// wrangler の CLI（JS ファイル）を node で直接動かす。
// npx は Windows だとシェル経由でしか起動できず、引数をシェルに渡すと Node が警告（DEP0190）を出すため
const require = createRequire(import.meta.url)
const wranglerPackageJson = require.resolve('wrangler/package.json')
const wranglerBin = join(
  dirname(wranglerPackageJson),
  (
    JSON.parse(readFileSync(wranglerPackageJson, 'utf8')) as {
      bin: { wrangler: string }
    }
  ).bin.wrangler,
)

const platform = await getPlatformProxy<Env>()
const { DB: db, IMAGES: bucket } = platform.env

// 表紙・コレクションの画像と、本文の中の画像（/images/<キー>）を集める
const keys = new Set<string>()
const rows = await db
  .prepare(
    `SELECT cover_image_key AS k, content AS body FROM posts
     UNION ALL SELECT image_key, description FROM collection_items`,
  )
  .all<{ k: string | null; body: string | null }>()
for (const row of rows.results) {
  if (row.k) keys.add(row.k)
  for (const m of row.body?.matchAll(
    /\/images\/([a-z0-9-]+\/[0-9a-f-]{36}\.[a-z]+)/g,
  ) ?? []) {
    keys.add(m[1])
  }
}

const dir = mkdtempSync(join(tmpdir(), 'mosunset-images-'))
let done = 0
const missing: string[] = []
try {
  for (const key of keys) {
    const object = await bucket.get(key)
    if (!object) {
      missing.push(key)
      continue
    }
    const file = join(dir, key.replace(/\//g, '_'))
    writeFileSync(file, Buffer.from(await object.arrayBuffer()))
    execFileSync(
      process.execPath,
      [
        wranglerBin,
        'r2',
        'object',
        'put',
        `${BUCKET}/${key}`,
        '--file',
        file,
        '--content-type',
        object.httpMetadata?.contentType ?? 'application/octet-stream',
        '--remote',
      ],
      { stdio: 'ignore' },
    )
    done++
    process.stdout.write(`\r${done} / ${keys.size}`)
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
  await platform.dispose()
}

console.log(`\n本番の R2 に送りました: ${done} 枚`)
if (missing.length > 0) {
  console.log(`ローカルに見つからなかった画像: ${missing.length} 枚`)
  for (const m of missing) console.log(`  - ${m}`)
}
