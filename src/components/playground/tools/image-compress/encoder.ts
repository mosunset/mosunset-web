// 画像の変換を頼む窓口。ふだんは Worker（OffscreenCanvas）に頼み、
// Worker で読めない画像（Safari の HEIC など）や Worker を使えないブラウザでは画面側の canvas で行う
import {
  canvasToBlob,
  type EncodeOptions,
  type EncodeResult,
  encodeImage,
  type OutputFormat,
} from './encode'
import type { EncodeRequest, EncodeResponse } from './encode.worker'

let worker: Worker | null = null
let nextId = 0
const pending = new Map<
  number,
  { resolve: (r: EncodeResult) => void; reject: (e: Error) => void }
>()

function canUseWorker() {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    'convertToBlob' in OffscreenCanvas.prototype &&
    typeof createImageBitmap !== 'undefined'
  )
}

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./encode.worker.ts', import.meta.url), {
    type: 'module',
  })
  worker.onmessage = (event: MessageEvent<EncodeResponse>) => {
    const msg = event.data
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.ok) p.resolve(msg.result)
    else p.reject(new Error(msg.error))
  }
  worker.onerror = () => {
    for (const p of pending.values())
      p.reject(new Error('Worker が止まりました'))
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

function encodeInWorker(file: Blob, options: EncodeOptions) {
  return new Promise<EncodeResult>((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, file, options } satisfies EncodeRequest)
  })
}

/** 画面側で変換する。<img> で読むので、ブラウザが表示できる形式ならそのまま扱える */
async function encodeOnMainThread(file: Blob, options: EncodeOptions) {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    // <img> は EXIF の向きを反映した大きさを返す
    return await encodeImage(img, img.naturalWidth, img.naturalHeight, options)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function encodeFile(
  file: Blob,
  options: EncodeOptions,
): Promise<EncodeResult> {
  if (canUseWorker()) {
    try {
      return await encodeInWorker(file, options)
    } catch {
      // Worker で読めなかったときは画面側でもう一度ためす
    }
  }
  return encodeOnMainThread(file, options)
}

/** このブラウザが書き出せる形式を調べる（書き出せない形式を頼むと PNG になる） */
export async function detectFormats(): Promise<Set<OutputFormat>> {
  const formats: OutputFormat[] = [
    'image/webp',
    'image/jpeg',
    'image/png',
    'image/avif',
  ]
  const ok = new Set<OutputFormat>()
  for (const f of formats) {
    try {
      let canvas: OffscreenCanvas | HTMLCanvasElement
      if (canUseWorker()) canvas = new OffscreenCanvas(1, 1)
      else {
        canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
      }
      canvas.getContext('2d')
      const blob = await canvasToBlob(canvas, f, 0.8)
      if (blob.type === f) ok.add(f)
    } catch {
      // 書き出せない
    }
  }
  return ok
}
