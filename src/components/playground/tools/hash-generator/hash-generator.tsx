import { md5, ripemd160, sha1 } from '@noble/hashes/legacy.js'
import { sha224, sha256, sha384, sha512 } from '@noble/hashes/sha2.js'
import { sha3_256, sha3_512 } from '@noble/hashes/sha3.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { FileUp, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { CopyButton } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type Algorithm = {
  name: string
  hash: (data: Uint8Array) => Uint8Array
  note?: string
}

const algorithms: Algorithm[] = [
  {
    name: 'MD5',
    hash: md5,
    note: '衝突が見つかっているので、改ざん検知には使わない',
  },
  {
    name: 'SHA-1',
    hash: sha1,
    note: '衝突が見つかっているので、新しい用途には使わない',
  },
  { name: 'SHA-224', hash: sha224 },
  { name: 'SHA-256', hash: sha256 },
  { name: 'SHA-384', hash: sha384 },
  { name: 'SHA-512', hash: sha512 },
  { name: 'SHA3-256', hash: sha3_256 },
  { name: 'SHA3-512', hash: sha3_512 },
  { name: 'RIPEMD-160', hash: ripemd160 },
  {
    name: 'md5(md5_hex)',
    hash: (d) => md5(utf8ToBytes(bytesToHex(md5(d)))),
    note: 'MD5 の 16 進文字列を、もう一度 MD5 にかけたもの',
  },
  {
    name: 'md5-half',
    // 16 進 32 文字の中央 16 文字（8〜24 文字目）
    hash: (d) => md5(d).slice(4, 12),
    note: 'MD5 の中央 8 バイト',
  },
  {
    name: 'MySQL 4.1+',
    hash: (d) => sha1(sha1(d)),
    note: 'sha1(sha1_bin)。MySQL の PASSWORD() は先頭に * を付けた大文字',
  },
]

type Format = 'hex' | 'HEX' | 'base64'

function encode(bytes: Uint8Array, format: Format) {
  if (format === 'base64') return btoa(String.fromCharCode(...bytes))
  const hex = bytesToHex(bytes)
  return format === 'HEX' ? hex.toUpperCase() : hex
}

export function HashGenerator() {
  const [text, setText] = useState('')
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(
    null,
  )
  const [format, setFormat] = useState<Format>('hex')
  const [dragging, setDragging] = useState(false)

  const input = useMemo(() => file?.bytes ?? utf8ToBytes(text), [file, text])
  const results = useMemo(
    () =>
      algorithms.map((a) => ({ ...a, value: encode(a.hash(input), format) })),
    [input, format],
  )

  const loadFile = async (f: File | undefined) => {
    if (!f) return
    setFile({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })
  }

  return (
    <div className="space-y-6">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: ファイルのドロップ領域。キーボードでは「ファイルを選ぶ」から選べる */}
      <div
        className={cn(
          'space-y-2 rounded-lg',
          dragging && 'ring-2 ring-primary',
        )}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          loadFile(e.dataTransfer.files[0])
        }}
      >
        {file ? (
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <FileUp className="size-5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{file.name}</div>
              <div className="text-xs text-muted-foreground">
                {file.bytes.length.toLocaleString('ja-JP')} バイト
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFile(null)}
            >
              <X />
              テキストに戻す
            </Button>
          </div>
        ) : (
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="ハッシュを計算する文字列（ファイルをここにドロップしても計算できます）"
            rows={4}
            className="font-mono"
          />
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="cursor-pointer text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            ファイルを選ぶ
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                loadFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          <fieldset className="inline-flex rounded-md border p-0.5">
            <legend className="sr-only">出力の形式</legend>
            {(['hex', 'HEX', 'base64'] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={format === f}
                onClick={() => setFormat(f)}
                className={cn(
                  'rounded px-3 py-1 font-mono text-xs text-muted-foreground',
                  format === f && 'bg-muted text-foreground',
                )}
              >
                {f}
              </button>
            ))}
          </fieldset>
        </div>
        <p className="text-xs text-muted-foreground">
          計算はすべてブラウザの中で行い、入力した内容やファイルはサーバーに送りません。
        </p>
      </div>

      <ul className="divide-y rounded-lg border">
        {results.map((r) => (
          <li
            key={r.name}
            className="grid gap-1 p-3 sm:grid-cols-[9rem_1fr_auto] sm:items-center sm:gap-3"
          >
            <div>
              <div className="text-sm font-medium">{r.name}</div>
              {r.note && (
                <div className="text-xs text-muted-foreground sm:hidden">
                  {r.note}
                </div>
              )}
            </div>
            <code
              className="break-all font-mono text-xs sm:text-sm"
              title={r.note}
            >
              {r.value}
            </code>
            <CopyButton
              value={r.value}
              size="icon"
              label={`${r.name} をコピー`}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
