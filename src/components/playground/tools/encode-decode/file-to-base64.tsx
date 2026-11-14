import { FileUp, X } from 'lucide-react'
import { useState } from 'react'

import { CopyButton } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/** これより大きいファイルは、テキスト欄が重くなるので変換しない */
const maxBytes = 10 * 1024 * 1024

type Loaded = { name: string; size: number; type: string; dataUrl: string }

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** ファイルを Base64 と data URL にする */
export function FileToBase64({
  urlSafe,
  padding,
}: {
  urlSafe: boolean
  padding: boolean
}) {
  const [file, setFile] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const load = async (f: File | undefined) => {
    if (!f) return
    if (f.size > maxBytes) {
      setError(
        `ファイルが大きすぎます（${(f.size / 1024 / 1024).toFixed(1)} MB）。10 MB までのファイルにしてください`,
      )
      return
    }
    try {
      let dataUrl = await readAsDataUrl(f)
      // 種類がわからないファイルは「data:;base64,」になるので補う
      if (dataUrl.startsWith('data:;'))
        dataUrl = `data:application/octet-stream;${dataUrl.slice(6)}`
      setFile({ name: f.name, size: f.size, type: f.type, dataUrl })
      setError(null)
    } catch {
      setError('ファイルを読み込めませんでした')
    }
  }

  let base64 = file ? file.dataUrl.slice(file.dataUrl.indexOf(',') + 1) : ''
  if (urlSafe) base64 = base64.replace(/\+/g, '-').replace(/\//g, '_')
  if (!padding) base64 = base64.replace(/=+$/, '')
  const isImage = file?.type.startsWith('image/') ?? false

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">ファイルを Base64・data URL にする</h2>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: ファイルのドロップ領域。キーボードでは「ファイルを選ぶ」から選べる */}
      <div
        className={cn('rounded-lg', dragging && 'ring-2 ring-primary')}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          load(e.dataTransfer.files[0])
        }}
      >
        {file ? (
          <div className="flex items-center gap-3 rounded-lg border p-4">
            {isImage ? (
              <img
                src={file.dataUrl}
                alt=""
                className="size-12 shrink-0 rounded object-cover"
              />
            ) : (
              <FileUp className="size-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{file.name}</div>
              <div className="text-xs text-muted-foreground">
                {file.type || '種類不明'}・{file.size.toLocaleString('ja-JP')}{' '}
                バイト
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFile(null)}
            >
              <X />
              閉じる
            </Button>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground hover:bg-muted/50">
            <FileUp className="size-6" />
            ここにファイルをドロップするか、クリックして選んでください（10 MB
            まで）
            <input
              type="file"
              className="sr-only"
              onChange={(e) => {
                load(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {file && (
        <div className="grid gap-3 md:grid-cols-2">
          <Output
            label="Base64"
            note={
              urlSafe || !padding
                ? '上の Base64 の設定（URL-safe・パディング）に合わせています'
                : undefined
            }
            value={base64}
          />
          <Output
            label="data URL"
            note="img の src や CSS の url() にそのまま使えます"
            value={file.dataUrl}
          />
        </div>
      )}
      {file && isImage && (
        <div className="flex justify-center rounded-md border bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-3">
          <img
            src={file.dataUrl}
            alt={file.name}
            className="max-h-80 max-w-full object-contain"
          />
        </div>
      )}
    </section>
  )
}

function Output({
  label,
  note,
  value,
}: {
  label: string
  note?: string
  value: string
}) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">
            {label}
            <span className="ml-2 text-xs font-normal tabular-nums text-muted-foreground">
              {value.length.toLocaleString('ja-JP')} 文字
            </span>
          </div>
          {note && <div className="text-xs text-muted-foreground">{note}</div>}
        </div>
        <CopyButton value={value} label={`${label} をコピー`} />
      </div>
      <Textarea
        value={value}
        readOnly
        rows={5}
        spellCheck={false}
        className="break-all font-mono text-xs"
        onFocus={(e) => e.target.select()}
      />
    </div>
  )
}
