import type { FaceDetector, ImageSegmenter } from '@mediapipe/tasks-vision'
// MediaPipe の WASM は npm パッケージから同じサイトで配る（外部の CDN から読み込まない）
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'

/** モデルも public/ に置いて同じサイトから読み込む（どれも Apache-2.0） */
const MODEL_DIR = '/playground/image-privacy/models'

export type SegmentModel = 'person' | 'object'

const segmentModels: Record<SegmentModel, string> = {
  // 人物だけを切り抜く（Selfie Segmenter）
  person: `${MODEL_DIR}/selfie_segmenter.tflite`,
  // 人・動物・乗り物など 20 種類（DeepLab v3。0 番が背景）
  object: `${MODEL_DIR}/deeplab_v3.tflite`,
}

const fileset: Parameters<typeof ImageSegmenter.createFromOptions>[0] = {
  wasmLoaderPath,
  wasmBinaryPath,
}

let visionPromise: Promise<typeof import('@mediapipe/tasks-vision')> | null =
  null
const loadVision = () => {
  visionPromise ??= import('@mediapipe/tasks-vision').catch((e) => {
    visionPromise = null
    throw e
  })
  return visionPromise
}

const segmenters = new Map<SegmentModel, Promise<ImageSegmenter>>()

/** 背景を分けるモデルは、使い始めたときに 1 度だけ読み込む */
function loadSegmenter(model: SegmentModel) {
  let p = segmenters.get(model)
  if (!p) {
    p = loadVision()
      .then(({ ImageSegmenter }) =>
        ImageSegmenter.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: segmentModels[model],
            delegate: 'CPU',
          },
          runningMode: 'IMAGE',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        }),
      )
      .catch((e) => {
        segmenters.delete(model)
        throw e
      })
    segmenters.set(model, p)
  }
  return p
}

let faceDetectorPromise: Promise<FaceDetector> | null = null

function loadFaceDetector() {
  faceDetectorPromise ??= loadVision()
    .then(({ FaceDetector }) =>
      FaceDetector.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: `${MODEL_DIR}/blaze_face_short_range.tflite`,
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        // 信頼度のしきい値は画面で変えられるよう、ここでは低めに取っておく
        minDetectionConfidence: 0.3,
        minSuppressionThreshold: 0.3,
      }),
    )
    .catch((e) => {
      faceDetectorPromise = null
      throw e
    })
  return faceDetectorPromise
}

/**
 * 画像の各画素が「残すもの（人物など）」である確からしさ（0〜255）。
 * モデルの出力は 256×256 ほどの小さなものなので、画像の大きさになめらかに引き伸ばす
 */
export async function segment(
  source: HTMLCanvasElement,
  model: SegmentModel,
): Promise<Uint8ClampedArray> {
  const segmenter = await loadSegmenter(model)
  const result = segmenter.segment(source)
  try {
    const masks = result.confidenceMasks ?? []
    if (masks.length === 0) throw new Error('マスクがありません')
    const { width, height } = masks[0]
    // 1 枚なら人物の確からしさ、複数なら 0 番（背景）の反対
    const single = masks.length === 1
    const values = masks[0].getAsFloat32Array()
    const small = new ImageData(width, height)
    for (let i = 0; i < values.length; i++) {
      const v = single ? values[i] : 1 - values[i]
      small.data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, v)) * 255)
    }
    const smallCanvas = document.createElement('canvas')
    smallCanvas.width = width
    smallCanvas.height = height
    smallCanvas.getContext('2d')?.putImageData(small, 0, 0)

    const big = document.createElement('canvas')
    big.width = source.width
    big.height = source.height
    const ctx = big.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('canvas が使えません')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(smallCanvas, 0, 0, big.width, big.height)
    const data = ctx.getImageData(0, 0, big.width, big.height).data
    const conf = new Uint8ClampedArray(big.width * big.height)
    for (let i = 0; i < conf.length; i++) conf[i] = data[i * 4 + 3]
    return conf
  } finally {
    result.close()
  }
}

export type DetectedFace = {
  x: number
  y: number
  w: number
  h: number
  score: number
}

/** 重なりの割合（小さいほうの面積に対して） */
function overlap(a: DetectedFace, b: DetectedFace) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return (ix * iy) / Math.min(a.w * a.h, b.w * b.h)
}

/**
 * 顔を見つける。使うモデル（BlazeFace の近距離用）は大きく写った顔向けなので、
 * small を付けると画像を重なりのあるタイルに分けても探し、集合写真の小さな顔も拾う
 */
export async function detectFaces(
  source: HTMLCanvasElement,
  small: boolean,
): Promise<DetectedFace[]> {
  const detector = await loadFaceDetector()
  const found: DetectedFace[] = []
  const run = (sx: number, sy: number, sw: number, sh: number) => {
    let target: HTMLCanvasElement = source
    if (sx !== 0 || sy !== 0 || sw !== source.width || sh !== source.height) {
      target = document.createElement('canvas')
      target.width = Math.round(sw)
      target.height = Math.round(sh)
      target
        .getContext('2d')
        ?.drawImage(source, sx, sy, sw, sh, 0, 0, target.width, target.height)
    }
    for (const d of detector.detect(target).detections) {
      const b = d.boundingBox
      if (!b) continue
      found.push({
        x: sx + b.originX,
        y: sy + b.originY,
        w: b.width,
        h: b.height,
        score: d.categories[0]?.score ?? 0,
      })
    }
  }

  run(0, 0, source.width, source.height)
  if (small) {
    // 2×2 と 3×3 のタイル（となりと 3 割ずつ重ねる）
    for (const n of [2, 3]) {
      const tw = source.width / (n - (n - 1) * 0.3)
      const th = source.height / (n - (n - 1) * 0.3)
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          run(i * tw * 0.7, j * th * 0.7, tw, th)
        }
      }
    }
  }

  // 同じ顔を何度も見つけたら、信頼度の高いものだけ残す
  found.sort((a, b) => b.score - a.score)
  const kept: DetectedFace[] = []
  for (const f of found) {
    if (kept.every((k) => overlap(k, f) < 0.5)) kept.push(f)
  }
  return kept
}
