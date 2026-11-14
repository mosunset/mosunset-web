/// <reference lib="webworker" />
/**
 * Whisper を動かす Web Worker。モデルの読み込みと文字起こしはここで行い、画面を固まらせない。
 * 音声はこの Worker とブラウザの中だけで扱い、外には送らない（外から取るのはモデルのファイルなどだけ）
 */
import type {
  AutomaticSpeechRecognitionPipeline,
  WhisperTokenizer,
} from '@huggingface/transformers'

import type { FromWorker, ToWorker, WhisperDevice } from './types'

/**
 * Transformers.js（Apache-2.0）は、ブラウザ用にまとめ済みのファイルを public/playground/whisper-transcribe/ に置いて使う。
 * npm のパッケージを Vite でまとめると、ONNX Runtime の wasm（約 27MB）が一緒に出力され、
 * Cloudflare の静的ファイルの上限（1 ファイル 25MiB）を超えるため。
 * wasm は Transformers.js の既定どおり cdn.jsdelivr.net から、モデルは huggingface.co から読み込む。
 * 入れ替えるときは devDependencies の @huggingface/transformers（型だけに使う）と同じ版の dist/transformers.min.js をコピーする
 */
// 開発中の Vite は「/」で始まる import に ?import を付けて public のファイルを読めなくするので、オリジンから書く
const TRANSFORMERS = `${self.location.origin}/playground/whisper-transcribe/transformers.min.js`
type Transformers = typeof import('@huggingface/transformers')
let transformers: Promise<Transformers> | null = null
const loadTransformers = () => {
  transformers ??= import(
    /* @vite-ignore */ TRANSFORMERS
  ) as Promise<Transformers>
  transformers.catch(() => {
    transformers = null
  })
  return transformers
}

const post = (message: FromWorker) => self.postMessage(message)

let current: {
  key: string
  promise: Promise<AutomaticSpeechRecognitionPipeline>
} | null = null

/** モデルは「モデル × 動かし方」ごとに 1 度だけ読み込む（読み込み済みのファイルはブラウザにキャッシュされる） */
function load(model: string, device: WhisperDevice) {
  const key = `${model}:${device}`
  if (current?.key === key) return current.promise
  const previous = current
  current = {
    key,
    promise: (async () => {
      await (await previous?.promise.catch(() => null))?.dispose()
      const { pipeline } = await loadTransformers()
      const asr = await pipeline('automatic-speech-recognition', model, {
        device,
        // WebGPU ではエンコーダーを fp32 にしないと精度が落ちやすい。WASM は軽い 8bit にする
        dtype:
          device === 'webgpu'
            ? { encoder_model: 'fp32', decoder_model_merged: 'q4' }
            : { encoder_model: 'q8', decoder_model_merged: 'q8' },
        progress_callback: (p) => {
          if (p.status === 'progress') {
            post({
              type: 'progress',
              file: p.file,
              loaded: p.loaded,
              total: p.total,
            })
          }
        },
      })
      return asr as AutomaticSpeechRecognitionPipeline
    })(),
  }
  current.promise.catch(() => {
    if (current?.key === key) current = null
  })
  return current.promise
}

self.addEventListener('message', async (event: MessageEvent<ToWorker>) => {
  const msg = event.data
  try {
    const asr = await load(msg.model, msg.device)
    post({ type: 'ready' })
    if (msg.type === 'load') return

    const { WhisperTextStreamer } = await loadTransformers()
    let text = ''
    const streamer = new WhisperTextStreamer(
      asr.tokenizer as WhisperTokenizer,
      {
        skip_prompt: true,
        callback_function: (piece) => {
          text += piece
          post({ type: 'partial', text })
        },
      },
    )
    const result = await asr(msg.audio, {
      language: msg.language ?? undefined,
      task: 'transcribe',
      return_timestamps: true,
      // 30 秒ずつ区切り、つなぎ目は 5 秒重ねて読む
      chunk_length_s: 30,
      stride_length_s: 5,
      streamer,
    })
    post({
      type: 'done',
      text: result.text,
      chunks: (result.chunks ?? []).map((c) => ({
        start: c.timestamp[0] ?? 0,
        end: c.timestamp[1],
        text: c.text,
      })),
    })
  } catch (e) {
    post({
      type: 'error',
      message: e instanceof Error ? e.message : String(e),
    })
  }
})
