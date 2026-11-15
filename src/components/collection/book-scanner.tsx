import { Link } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import {
  BookCheck,
  BookPlus,
  BookX,
  ExternalLink,
  ImageOff,
  Loader2,
  ScanBarcode,
  Search,
} from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'

import {
  type BarcodeReader,
  createBarcodeReader,
  pickIsbn,
} from '@/components/collection/barcode-reader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { scanBook } from '@/functions/isbn'
import { errorMessage } from '@/lib/errors'
import { formatDay } from '@/lib/format'
import { thumbnailUrl } from '@/lib/images'
import { cn } from '@/lib/utils'

type ScanResult = Awaited<ReturnType<typeof scanBook>>
type SourceResult = ScanResult['google']

type Phase =
  | { name: 'scanning' }
  | { name: 'looking'; isbn: string }
  | { name: 'result'; result: ScanResult }
  | { name: 'failed'; isbn: string; message: string }

// 読み取りの準備（wasm の読み込み）は 1 度だけにする
let readerPromise: Promise<BarcodeReader> | null = null
const getReader = () => {
  readerPromise ??= createBarcodeReader().catch((e) => {
    readerPromise = null
    throw e
  })
  return readerPromise
}

function cameraErrorMessage(e: unknown) {
  const name = e instanceof DOMException ? e.name : ''
  if (name === 'NotAllowedError') {
    return 'カメラの使用が許可されていません。ブラウザの設定で、このサイトのカメラを許可してください'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'カメラが見つかりません'
  }
  if (name === 'NotReadableError') {
    return 'カメラをほかのアプリが使っています'
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'このブラウザではカメラを使えません'
  }
  return errorMessage(e, 'カメラを起動できませんでした')
}

/**
 * 本の一覧に出す「バーコードで調べる」（管理者のみ）。
 * カメラで ISBN を読み、もう持っているかと、Google Books・楽天ブックスの結果を出す
 */
export function BookScanner() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ScanBarcode />
        バーコードで調べる
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>バーコードで調べる</DialogTitle>
            <DialogDescription>
              本の裏の、978 で始まる方のバーコードを枠に入れてください
            </DialogDescription>
          </DialogHeader>
          {/* 閉じたらカメラを止めて、中身も最初に戻す */}
          {open && <ScannerBody />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function ScannerBody() {
  const scan = useServerFn(scanBook)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [phase, setPhase] = useState<Phase>({ name: 'scanning' })
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [manual, setManual] = useState('')

  // 読み取り中だけカメラを動かす
  useEffect(() => {
    if (phase.name !== 'scanning') return
    let cancelled = false
    let stream: MediaStream | null = null
    let timer: number | undefined
    const video = videoRef.current

    const start = async () => {
      setCameraError(null)
      setCameraReady(false)
      try {
        const [read, media] = await Promise.all([
          getReader(),
          navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          }),
        ])
        if (cancelled || !video) {
          for (const track of media.getTracks()) track.stop()
          return
        }
        stream = media
        video.srcObject = media
        await video.play()
        setCameraReady(true)
        // 1 回読み終わってから次へ（重くならないように）
        const tick = async () => {
          if (cancelled) return
          try {
            if (video.readyState >= video.HAVE_CURRENT_DATA) {
              const isbn = pickIsbn(await read(video))
              if (isbn && !cancelled) {
                navigator.vibrate?.(60)
                setPhase({ name: 'looking', isbn })
                return
              }
            }
          } catch {
            // 読めなかったコマは飛ばす
          }
          timer = window.setTimeout(tick, 150)
        }
        tick()
      } catch (e) {
        if (!cancelled) setCameraError(cameraErrorMessage(e))
      }
    }
    start()

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      for (const track of stream?.getTracks() ?? []) track.stop()
      if (video) video.srcObject = null
    }
  }, [phase.name])

  // 読んだ（入力した）ISBN を調べる
  const lookingIsbn = phase.name === 'looking' ? phase.isbn : null
  useEffect(() => {
    if (!lookingIsbn) return
    let cancelled = false
    scan({ data: { isbn: lookingIsbn } })
      .then((result) => {
        if (!cancelled) setPhase({ name: 'result', result })
      })
      .catch((e) => {
        if (!cancelled) {
          setPhase({
            name: 'failed',
            isbn: lookingIsbn,
            message: errorMessage(e, '調べられませんでした'),
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [lookingIsbn, scan])

  const submitManual = (e: FormEvent) => {
    e.preventDefault()
    const isbn = manual.replace(/[^0-9Xx]/g, '')
    if (isbn) setPhase({ name: 'looking', isbn })
  }

  const scanning = phase.name === 'scanning'

  return (
    <div className="min-w-0 space-y-4">
      {scanning && (
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-black">
          <video
            ref={videoRef}
            className="size-full object-cover"
            playsInline
            muted
          />
          {/* バーコードを入れる枠 */}
          <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-[28%] -translate-y-1/2 rounded-md border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          {!cameraReady && !cameraError && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/80">
              <Loader2 className="size-4 animate-spin" />
              カメラを起動しています…
            </div>
          )}
          {cameraError && (
            <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">
              {cameraError}
            </p>
          )}
        </div>
      )}

      {phase.name === 'looking' && (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {phase.isbn} を調べています…
        </p>
      )}

      {phase.name === 'failed' && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {phase.isbn}：{phase.message}
        </p>
      )}

      {phase.name === 'result' && <ScanResultView result={phase.result} />}

      {scanning ? (
        <form onSubmit={submitManual} className="flex gap-2">
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            inputMode="numeric"
            placeholder="読めないときは ISBN を入力"
            aria-label="ISBN"
          />
          <Button type="submit" variant="outline" disabled={!manual.trim()}>
            <Search />
            調べる
          </Button>
        </form>
      ) : (
        phase.name !== 'looking' && (
          <Button
            className="w-full"
            onClick={() => {
              setManual('')
              setPhase({ name: 'scanning' })
            }}
          >
            <ScanBarcode />
            続けて読む
          </Button>
        )
      )}
    </div>
  )
}

function ScanResultView({ result }: { result: ScanResult }) {
  const { owned, title } = result

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'flex items-start gap-3 rounded-lg border p-3',
          owned
            ? 'border-emerald-500/40 bg-emerald-500/10'
            : 'border-amber-500/40 bg-amber-500/10',
        )}
      >
        {owned?.imageKey ? (
          <img
            src={thumbnailUrl(owned.imageKey) ?? undefined}
            alt=""
            className="h-20 w-14 shrink-0 rounded object-cover"
          />
        ) : owned ? (
          <BookCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        ) : (
          <BookX className="mt-0.5 size-5 shrink-0 text-amber-600" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold">
            {owned ? 'もう持っています' : 'まだ登録していません'}
            {owned && !owned.published && (
              <Badge variant="outline" className="ml-2 align-middle">
                非公開
              </Badge>
            )}
          </p>
          <p className="break-words text-sm">
            {title ?? '書名はわかりませんでした'}
          </p>
          <p className="text-xs text-muted-foreground">ISBN {result.isbn}</p>
          {owned ? (
            <Button asChild size="sm" variant="outline" className="mt-1">
              <Link to="/books/$slug" params={{ slug: owned.slug }}>
                本のページを開く
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm" className="mt-1">
              <Link
                to="/admin/collections/$kind/new"
                params={{ kind: 'book' }}
                search={{ isbn: result.isbn }}
              >
                <BookPlus />
                登録する
              </Link>
            </Button>
          )}
        </div>
      </div>

      <SourceCard name="楽天ブックス" result={result.rakuten} />
      <SourceCard name="Google Books" result={result.google} />
    </div>
  )
}

function SourceCard({ name, result }: { name: string; result: SourceResult }) {
  return (
    <section className="rounded-lg border p-3">
      <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
        {name}
      </h3>
      {result.status === 'found' ? (
        <div className="flex gap-3">
          {result.book.coverUrl ? (
            <img
              src={result.book.coverUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-24 w-16 shrink-0 rounded border object-cover"
            />
          ) : (
            <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded border text-muted-foreground">
              <ImageOff className="size-5" />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-0.5 text-sm">
            <p className="break-words font-medium">{result.book.title}</p>
            {result.book.author && (
              <p className="text-muted-foreground">{result.book.author}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {[
                result.book.publisher,
                result.book.publishedDate &&
                  formatDay(result.book.publishedDate),
              ]
                .filter(Boolean)
                .join('・')}
            </p>
            {result.book.description && (
              <p className="line-clamp-3 pt-1 text-xs text-muted-foreground">
                {result.book.description}
              </p>
            )}
            {result.book.link && (
              <a
                href={result.book.link}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 pt-1 text-xs underline underline-offset-2"
              >
                {name}で見る
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {result.status === 'not-found'
            ? '見つかりませんでした'
            : `使えませんでした：${result.message}`}
        </p>
      )}
    </section>
  )
}
