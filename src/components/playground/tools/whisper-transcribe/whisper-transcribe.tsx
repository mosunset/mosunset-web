import {
  Cpu,
  Download,
  FileAudio,
  Loader2,
  Mic,
  Square,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { CopyButton } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import { formatClock, formatTime, toPlainText, toSrt, toVtt } from './format'
import type { FromWorker, Segment, ToWorker, WhisperDevice } from './types'

/** onnx-community が公開している Whisper（重みは MIT）。大きいほど正確で、読み込みと計算に時間がかかる */
const models = [
  { id: 'onnx-community/whisper-tiny', label: 'tiny（いちばん軽い）' },
  { id: 'onnx-community/whisper-base', label: 'base（標準）' },
  { id: 'onnx-community/whisper-small', label: 'small（より正確・重い）' },
] as const

/** Whisper の言語名と、画面に出す名前 */
const languages = [
  { id: 'japanese', label: '日本語' },
  { id: 'english', label: '英語' },
  { id: 'chinese', label: '中国語' },
  { id: 'korean', label: '韓国語' },
  { id: 'spanish', label: 'スペイン語' },
  { id: 'french', label: 'フランス語' },
  { id: 'german', label: 'ドイツ語' },
  { id: 'portuguese', label: 'ポルトガル語' },
  { id: 'italian', label: 'イタリア語' },
  { id: 'russian', label: 'ロシア語' },
  { id: 'vietnamese', label: 'ベトナム語' },
  { id: 'thai', label: 'タイ語' },
  { id: 'indonesian', label: 'インドネシア語' },
  { id: '', label: '自動で判定' },
] as const

type Phase =
  | 'idle'
  | 'recording'
  | 'decoding'
  | 'loading'
  | 'transcribing'
  | 'done'
  | 'error'

type Source = { name: string; url: string; duration: number }

const selectClass =
  'h-10 w-full rounded-lg border bg-background px-2.5 text-base md:h-8 md:text-sm'

/** 音声・動画ファイルを、Whisper が読む 16kHz・モノラルの波形にする */
async function decodeAudio(blob: Blob) {
  const ctx = new AudioContext({ sampleRate: 16000 })
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer())
    const audio = new Float32Array(buffer.length)
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c)
      for (let i = 0; i < data.length; i++) {
        audio[i] += data[i] / buffer.numberOfChannels
      }
    }
    return audio
  } finally {
    ctx.close()
  }
}

/** WebGPU が使えるか（アダプターが取れるか）を確かめる */
async function detectWebGpu() {
  try {
    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu
    return Boolean(gpu && (await gpu.requestAdapter()))
  } catch {
    return false
  }
}

function download(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const formatBytes = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(n / 1024)} KB`

export function WhisperTranscribe() {
  const workerRef = useRef<Worker | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const [webGpu, setWebGpu] = useState<boolean | null>(null)
  const [device, setDevice] = useState<WhisperDevice>('wasm')
  const [model, setModel] = useState<string>(models[0].id)
  const [language, setLanguage] = useState<string>('japanese')
  const [showTime, setShowTime] = useState(true)

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [files, setFiles] = useState<
    Record<string, { loaded: number; total: number }>
  >({})
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [source, setSource] = useState<Source | null>(null)
  const [partial, setPartial] = useState('')
  const [segments, setSegments] = useState<Segment[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [dragging, setDragging] = useState(false)

  // 最初に WebGPU が使えるかを調べ、使えるなら WebGPU を既定にする
  useEffect(() => {
    detectWebGpu().then((ok) => {
      setWebGpu(ok)
      if (ok) setDevice('webgpu')
    })
  }, [])

  // ページを離れたら Worker・録音・再生用の URL を片付ける
  useEffect(
    () => () => {
      workerRef.current?.terminate()
      for (const t of recorderRef.current?.stream.getTracks() ?? []) t.stop()
    },
    [],
  )
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source.url)
    },
    [source],
  )

  // 録音中・文字起こし中の経過時間
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'transcribing') return
    const started = performance.now()
    const id = window.setInterval(() => {
      const s = (performance.now() - started) / 1000
      if (phase === 'recording') setRecordSeconds(s)
      else setElapsed(s)
    }, 250)
    return () => window.clearInterval(id)
  }, [phase])

  const busy =
    phase === 'recording' ||
    phase === 'decoding' ||
    phase === 'loading' ||
    phase === 'transcribing'

  /** Worker は 1 つだけ作って使い回す（モデルを読み込み直さないため） */
  const getWorker = () => {
    if (workerRef.current) return workerRef.current
    const w = new Worker(new URL('./whisper.worker.ts', import.meta.url), {
      type: 'module',
    })
    w.addEventListener('message', (e: MessageEvent<FromWorker>) => {
      const msg = e.data
      switch (msg.type) {
        case 'progress':
          setFiles((f) => ({
            ...f,
            [msg.file]: { loaded: msg.loaded, total: msg.total },
          }))
          break
        case 'ready':
          setPhase((p) => (p === 'loading' ? 'transcribing' : p))
          break
        case 'partial':
          setPartial(msg.text)
          break
        case 'done':
          setSegments(msg.chunks)
          setPartial('')
          setPhase('done')
          break
        case 'error':
          setError(`うまく処理できませんでした（${msg.message}）`)
          setPhase('error')
          break
      }
    })
    w.addEventListener('error', () => {
      setError('文字起こしの処理が止まりました。もう一度お試しください')
      setPhase('error')
      w.terminate()
      workerRef.current = null
    })
    workerRef.current = w
    return w
  }

  const transcribe = async (blob: Blob, name: string) => {
    setError(null)
    setSegments([])
    setPartial('')
    setElapsed(0)
    setPhase('decoding')
    let audio: Float32Array
    try {
      audio = await decodeAudio(blob)
    } catch {
      setError(
        '音声を読み取れませんでした。ブラウザが再生できる形式（mp3・m4a・wav・mp4 など）か確かめてください',
      )
      setPhase('error')
      return
    }
    setSource({
      name,
      url: URL.createObjectURL(blob),
      duration: audio.length / 16000,
    })
    const key = `${model}:${device}`
    if (key !== loadedKey) setFiles({})
    setLoadedKey(key)
    setPhase(key === loadedKey ? 'transcribing' : 'loading')
    const message: ToWorker = {
      type: 'transcribe',
      model,
      device,
      audio,
      language: language || null,
    }
    getWorker().postMessage(message, [audio.buffer])
  }

  const cancel = () => {
    workerRef.current?.terminate()
    workerRef.current = null
    setLoadedKey(null)
    setPartial('')
    setPhase('idle')
  }

  const startRecording = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const parts: Blob[] = []
      recorder.addEventListener('dataavailable', (e) => parts.push(e.data))
      recorder.addEventListener('stop', () => {
        for (const t of stream.getTracks()) t.stop()
        recorderRef.current = null
        const blob = new Blob(parts, { type: recorder.mimeType })
        if (blob.size > 0) transcribe(blob, 'マイクの録音')
        else setPhase('idle')
      })
      recorder.start()
      recorderRef.current = recorder
      setRecordSeconds(0)
      setPhase('recording')
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'マイクの使用が許可されませんでした'
          : 'マイクを使えませんでした',
      )
      setPhase('error')
    }
  }

  const pickFile = (file: File | undefined) => {
    if (!file || busy) return
    if (!/^(audio|video)\//.test(file.type) && file.type !== '') {
      setError('音声か動画のファイルを選んでください')
      setPhase('error')
      return
    }
    transcribe(file, file.name)
  }

  const seek = (seconds: number) => {
    const a = audioRef.current
    if (!a) return
    a.currentTime = seconds
    a.play().catch(() => {})
  }

  const duration = source?.duration ?? 0
  const plain = toPlainText(segments)
  const srt = toSrt(segments, duration)
  const vtt = toVtt(segments, duration)
  const baseName = (source?.name ?? 'transcript').replace(/\.[^.]+$/, '')

  const totals = Object.values(files).reduce(
    (acc, f) => ({ loaded: acc.loaded + f.loaded, total: acc.total + f.total }),
    { loaded: 0, total: 0 },
  )
  const loadPercent =
    totals.total > 0 ? Math.min(100, (totals.loaded / totals.total) * 100) : 0

  return (
    <div className="space-y-6">
      {/* 設定 */}
      <fieldset
        disabled={busy}
        className="grid gap-4 rounded-xl border p-4 sm:grid-cols-3"
      >
        <legend className="px-1 text-sm font-medium">設定</legend>
        <div className="space-y-2">
          <Label htmlFor="whisper-model">モデル</Label>
          <select
            id="whisper-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className={selectClass}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="whisper-language">話している言語</Label>
          <select
            id="whisper-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className={selectClass}
          >
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="whisper-device">計算に使うもの</Label>
          <select
            id="whisper-device"
            value={device}
            onChange={(e) => setDevice(e.target.value as WhisperDevice)}
            className={selectClass}
          >
            <option value="webgpu" disabled={!webGpu}>
              WebGPU（GPU・速い）
            </option>
            <option value="wasm">WASM（CPU・どこでも動く）</option>
          </select>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:col-span-3">
          {webGpu === null ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              WebGPU が使えるか調べています…
            </>
          ) : webGpu ? (
            <>
              <Zap className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              このブラウザでは WebGPU が使えます。GPU で速く文字起こしできます。
            </>
          ) : (
            <>
              <Cpu className="size-3.5" />
              このブラウザでは WebGPU
              が使えないため、CPU（WASM）で計算します。少し時間がかかります。
            </>
          )}
        </p>
      </fieldset>

      {/* 入力 */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: ファイルのドロップ領域。キーボードでは「ファイルを選ぶ」から選べる */}
      <div
        className={cn(
          'flex flex-col items-center gap-4 rounded-xl border-2 border-dashed p-6 text-center transition-colors',
          dragging && 'border-primary bg-primary/5',
        )}
        onDragOver={(e) => {
          e.preventDefault()
          if (!busy) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          pickFile(e.dataTransfer.files[0])
        }}
      >
        <p className="text-sm text-muted-foreground">
          音声・動画ファイルをここにドロップするか、下のボタンから選んでください。
          <br />
          音声はブラウザの中だけで処理し、サーバーには送りません。
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" asChild disabled={busy}>
            <label
              className={cn(
                'cursor-pointer',
                busy && 'pointer-events-none opacity-50',
              )}
            >
              <FileAudio />
              ファイルを選ぶ
              <input
                type="file"
                accept="audio/*,video/*"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  pickFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
          </Button>
          {phase === 'recording' ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => recorderRef.current?.stop()}
            >
              <Square />
              録音を止めて文字にする（{formatClock(recordSeconds)}）
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={startRecording}
              disabled={busy}
            >
              <Mic />
              マイクで録音
            </Button>
          )}
        </div>
      </div>

      {/* 進み具合 */}
      {(phase === 'decoding' ||
        phase === 'loading' ||
        phase === 'transcribing') && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              {phase === 'decoding' && '音声を読み取っています…'}
              {phase === 'loading' &&
                'モデルを読み込んでいます（初回のみ。数十〜数百 MB）…'}
              {phase === 'transcribing' &&
                `文字にしています…（${formatClock(elapsed)}）`}
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={cancel}>
              <X />
              中止
            </Button>
          </div>
          {phase === 'loading' && (
            <div className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{ width: `${loadPercent}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {totals.total > 0
                  ? `${formatBytes(totals.loaded)} / ${formatBytes(totals.total)}（${Math.floor(loadPercent)}%）`
                  : '準備しています…'}
              </p>
            </div>
          )}
          {partial && (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {partial}
            </p>
          )}
        </div>
      )}

      {phase === 'error' && error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* 結果 */}
      {source && (phase === 'done' || segments.length > 0) && (
        <section className="space-y-4">
          <div className="space-y-2">
            <h2 className="truncate text-sm font-medium">{source.name}</h2>
            {/* biome-ignore lint/a11y/useMediaCaption: 文字起こしの元の音声を聞き直すためのプレーヤー */}
            <audio
              ref={audioRef}
              src={source.url}
              controls
              className="w-full"
            />
          </div>

          {segments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              文字にできる声が見つかりませんでした。
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showTime}
                    onChange={(e) => setShowTime(e.target.checked)}
                    className="accent-primary"
                  />
                  時刻を表示
                </label>
                <span className="text-xs text-muted-foreground">
                  時刻を押すと、その場所から再生します
                </span>
              </div>
              <ol className="divide-y rounded-lg border">
                {segments.map((s, i) => (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: 結果が変わるときは丸ごと入れ替わる
                    key={i}
                    className="flex gap-3 px-3 py-2 text-sm"
                  >
                    {showTime && (
                      <button
                        type="button"
                        onClick={() => seek(s.start)}
                        className="shrink-0 font-mono text-xs leading-5 text-primary tabular-nums hover:underline"
                        title={`${formatTime(s.start)} から再生`}
                      >
                        {formatClock(s.start)}
                      </button>
                    )}
                    <span className="min-w-0 break-words">{s.text.trim()}</span>
                  </li>
                ))}
              </ol>

              <div className="grid gap-3 sm:grid-cols-3">
                <ExportCard
                  label="テキスト"
                  value={plain}
                  onDownload={() =>
                    download(plain, `${baseName}.txt`, 'text/plain')
                  }
                />
                <ExportCard
                  label="SRT（字幕）"
                  value={srt}
                  onDownload={() =>
                    download(srt, `${baseName}.srt`, 'application/x-subrip')
                  }
                />
                <ExportCard
                  label="VTT（字幕）"
                  value={vtt}
                  onDownload={() =>
                    download(vtt, `${baseName}.vtt`, 'text/vtt')
                  }
                />
              </div>
            </>
          )}
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        Transformers.js で OpenAI の Whisper（onnx-community
        の公開モデル）をブラウザの中で動かしています。モデルは初めて使うときに
        Hugging Face
        から読み込み、ブラウザに保存されます。音声そのものは外に送りません。
      </p>
    </div>
  )
}

function ExportCard({
  label,
  value,
  onDownload,
}: {
  label: string
  value: string
  onDownload: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex gap-1.5">
        <CopyButton value={value} size="icon" label={`${label}をコピー`} />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`${label}をダウンロード`}
          title={`${label}をダウンロード`}
          onClick={onDownload}
        >
          <Download />
        </Button>
      </div>
    </div>
  )
}
