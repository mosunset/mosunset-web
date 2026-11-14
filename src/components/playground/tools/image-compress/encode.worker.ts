// 画像の読み込み・縮小・書き出しを、画面を止めないよう別スレッドで行う
import { type EncodeOptions, type EncodeResult, encodeImage } from './encode'

export type EncodeRequest = { id: number; file: Blob; options: EncodeOptions }
export type EncodeResponse =
  | { id: number; ok: true; result: EncodeResult }
  | { id: number; ok: false; error: string }

// tsconfig は DOM の型なので、Worker の self として使う分だけ型を付ける
const worker = self as unknown as {
  onmessage: (event: MessageEvent<EncodeRequest>) => void
  postMessage: (message: EncodeResponse) => void
}

worker.onmessage = async (event) => {
  const { id, file, options } = event.data
  try {
    // from-image: EXIF の向き（Orientation）を反映して読み込む
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    })
    try {
      const result = await encodeImage(
        bitmap,
        bitmap.width,
        bitmap.height,
        options,
      )
      worker.postMessage({ id, ok: true, result })
    } finally {
      bitmap.close()
    }
  } catch (e) {
    worker.postMessage({
      id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
