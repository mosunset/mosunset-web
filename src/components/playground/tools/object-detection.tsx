import type {
  DetectedObject,
  ObjectDetection as Model,
} from '@tensorflow-models/coco-ssd'
import { Camera, ImagePlus, Loader2, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

/** COCO の 80 種類のラベルを日本語にする */
const labels: Record<string, string> = {
  person: '人',
  bicycle: '自転車',
  car: '車',
  motorcycle: 'バイク',
  airplane: '飛行機',
  bus: 'バス',
  train: '電車',
  truck: 'トラック',
  boat: '船',
  'traffic light': '信号機',
  'fire hydrant': '消火栓',
  'stop sign': '一時停止の標識',
  'parking meter': 'パーキングメーター',
  bench: 'ベンチ',
  bird: '鳥',
  cat: '猫',
  dog: '犬',
  horse: '馬',
  sheep: '羊',
  cow: '牛',
  elephant: '象',
  bear: '熊',
  zebra: 'シマウマ',
  giraffe: 'キリン',
  backpack: 'リュック',
  umbrella: '傘',
  handbag: 'ハンドバッグ',
  tie: 'ネクタイ',
  suitcase: 'スーツケース',
  frisbee: 'フリスビー',
  skis: 'スキー板',
  snowboard: 'スノーボード',
  'sports ball': 'ボール',
  kite: '凧',
  'baseball bat': 'バット',
  'baseball glove': 'グローブ',
  skateboard: 'スケートボード',
  surfboard: 'サーフボード',
  'tennis racket': 'テニスラケット',
  bottle: 'ボトル',
  'wine glass': 'ワイングラス',
  cup: 'カップ',
  fork: 'フォーク',
  knife: 'ナイフ',
  spoon: 'スプーン',
  bowl: 'ボウル',
  banana: 'バナナ',
  apple: 'りんご',
  sandwich: 'サンドイッチ',
  orange: 'オレンジ',
  broccoli: 'ブロッコリー',
  carrot: 'にんじん',
  'hot dog': 'ホットドッグ',
  pizza: 'ピザ',
  donut: 'ドーナツ',
  cake: 'ケーキ',
  chair: '椅子',
  couch: 'ソファ',
  'potted plant': '鉢植え',
  bed: 'ベッド',
  'dining table': 'テーブル',
  toilet: 'トイレ',
  tv: 'テレビ',
  laptop: 'ノートパソコン',
  mouse: 'マウス',
  remote: 'リモコン',
  keyboard: 'キーボード',
  'cell phone': 'スマホ',
  microwave: '電子レンジ',
  oven: 'オーブン',
  toaster: 'トースター',
  sink: 'シンク',
  refrigerator: '冷蔵庫',
  book: '本',
  clock: '時計',
  vase: '花瓶',
  scissors: 'はさみ',
  'teddy bear': 'ぬいぐるみ',
  'hair drier': 'ドライヤー',
  toothbrush: '歯ブラシ',
}
const ja = (label: string) => labels[label] ?? label

let modelPromise: Promise<Model> | null = null

/** TensorFlow.js とモデルは、使い始めたときに 1 度だけ読み込む */
function loadModel() {
  modelPromise ??= (async () => {
    const [tf, cocoSsd] = await Promise.all([
      import('@tensorflow/tfjs'),
      import('@tensorflow-models/coco-ssd'),
    ])
    await tf.ready()
    return cocoSsd.load({ base: 'lite_mobilenet_v2' })
  })().catch((e) => {
    modelPromise = null
    throw e
  })
  return modelPromise
}

type Status = 'idle' | 'loading' | 'camera' | 'image' | 'error'

export function ObjectDetection() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const runningRef = useRef(false)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [threshold, setThreshold] = useState(0.5)
  const thresholdRef = useRef(threshold)
  thresholdRef.current = threshold
  const [found, setFound] = useState<DetectedObject[]>([])
  const imageRef = useRef<HTMLImageElement | null>(null)

  const stop = () => {
    runningRef.current = false
    for (const track of streamRef.current?.getTracks() ?? []) track.stop()
    streamRef.current = null
  }
  // ページを離れたらカメラを止める
  // biome-ignore lint/correctness/useExhaustiveDependencies: stop は ref だけを触るので最初の 1 回で十分
  useEffect(() => stop, [])

  /** 画像（またはカメラの 1 コマ）と枠を canvas に描く */
  const draw = (
    source: CanvasImageSource,
    w: number,
    h: number,
    objects: DetectedObject[],
  ) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.width = w
    canvas.height = h
    ctx.drawImage(source, 0, 0, w, h)
    const line = Math.max(2, w / 300)
    ctx.lineWidth = line
    ctx.font = `bold ${Math.max(14, w / 40)}px sans-serif`
    for (const o of objects) {
      const [x, y, bw, bh] = o.bbox
      ctx.strokeStyle = '#f43f5e'
      ctx.strokeRect(x, y, bw, bh)
      const text = `${ja(o.class)} ${Math.round(o.score * 100)}%`
      const tw = ctx.measureText(text).width
      const th = Math.max(18, w / 32)
      ctx.fillStyle = '#f43f5e'
      ctx.fillRect(x - line / 2, Math.max(0, y - th), tw + 10, th)
      ctx.fillStyle = '#fff'
      ctx.fillText(text, x + 4, Math.max(th - 5, y - 5))
    }
  }

  const startCamera = async () => {
    stop()
    setError(null)
    setStatus('loading')
    try {
      const [model, stream] = await Promise.all([
        loadModel(),
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'environment' },
        }),
      ])
      streamRef.current = stream
      const video = document.createElement('video')
      video.playsInline = true
      video.muted = true
      video.srcObject = stream
      await video.play()
      videoRef.current = video
      runningRef.current = true
      setStatus('camera')
      // 1 コマの認識が終わってから次へ（重くならないように）
      const loop = async () => {
        if (!runningRef.current) return
        const objects =
          (await model.detect(video, 20, thresholdRef.current)) ?? []
        draw(video, video.videoWidth, video.videoHeight, objects)
        setFound(objects)
        requestAnimationFrame(loop)
      }
      loop()
    } catch (e) {
      stop()
      setStatus('error')
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'カメラの使用が許可されませんでした'
          : 'カメラまたはモデルを読み込めませんでした',
      )
    }
  }

  const detectImage = async (file: File | undefined) => {
    if (!file) return
    stop()
    setError(null)
    setStatus('loading')
    try {
      const model = await loadModel()
      const img = new Image()
      img.src = URL.createObjectURL(file)
      await img.decode()
      imageRef.current = img
      const objects = await model.detect(img, 30, thresholdRef.current)
      draw(img, img.naturalWidth, img.naturalHeight, objects)
      setFound(objects)
      setStatus('image')
    } catch {
      setStatus('error')
      setError('画像を読み込めませんでした')
    }
  }

  // 画像のときは、しきい値を変えたら認識し直す
  // biome-ignore lint/correctness/useExhaustiveDependencies: しきい値の変更だけで再実行する
  useEffect(() => {
    if (status !== 'image' || !imageRef.current) return
    const img = imageRef.current
    loadModel()
      .then((m) => m.detect(img, 30, threshold))
      .then((objects) => {
        draw(img, img.naturalWidth, img.naturalHeight, objects)
        setFound(objects)
      })
  }, [threshold])

  const counts = Object.entries(
    found.reduce<Record<string, number>>((acc, o) => {
      acc[ja(o.class)] = (acc[ja(o.class)] ?? 0) + 1
      return acc
    }, {}),
  ).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {status === 'camera' ? (
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              stop()
              setStatus('idle')
            }}
          >
            <Square />
            カメラを止める
          </Button>
        ) : (
          <Button
            type="button"
            onClick={startCamera}
            disabled={status === 'loading'}
          >
            <Camera />
            カメラで始める
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          asChild
          disabled={status === 'loading'}
        >
          <label className="cursor-pointer">
            <ImagePlus />
            画像で試す
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                detectImage(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
        </Button>
        <label className="ml-auto flex items-center gap-2 text-sm">
          信頼度
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="accent-primary"
          />
          <span className="w-10 font-mono tabular-nums">
            {Math.round(threshold * 100)}%
          </span>
        </label>
      </div>

      <div className="relative flex min-h-64 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
        <canvas
          ref={canvasRef}
          className={
            status === 'camera' || status === 'image'
              ? 'h-auto max-h-[70svh] w-full object-contain'
              : 'hidden'
          }
        />
        {status === 'idle' && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            「カメラで始める」か「画像で試す」を選んでください。
            <br />
            映像や画像はブラウザの中だけで処理し、サーバーには送りません。
          </p>
        )}
        {status === 'loading' && (
          <p className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            モデルを読み込んでいます（初回のみ）…
          </p>
        )}
        {status === 'error' && (
          <p className="p-8 text-sm text-destructive">{error}</p>
        )}
      </div>

      {counts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {counts.map(([label, n]) => (
            <span key={label} className="rounded-full border px-3 py-1 text-sm">
              {label} × {n}
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        TensorFlow.js の COCO-SSD（MobileNet v2）で、80
        種類のものを見つけます。モデルは初めて使うときに読み込みます。
      </p>
    </div>
  )
}
