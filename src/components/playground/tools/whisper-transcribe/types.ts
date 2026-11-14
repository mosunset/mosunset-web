export type WhisperDevice = 'webgpu' | 'wasm'

/** タイムスタンプ付きの 1 区切り（秒）。最後の区切りは終わりが分からないことがある */
export type Segment = { start: number; end: number | null; text: string }

export type ToWorker =
  | { type: 'load'; model: string; device: WhisperDevice }
  | {
      type: 'transcribe'
      model: string
      device: WhisperDevice
      /** 16kHz・モノラル */
      audio: Float32Array
      /** Whisper の言語名（'japanese' など）。null は自動判定 */
      language: string | null
    }

export type FromWorker =
  | { type: 'progress'; file: string; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'partial'; text: string }
  | { type: 'done'; text: string; chunks: Segment[] }
  | { type: 'error'; message: string }
