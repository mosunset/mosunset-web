/**
 * カメラの映像から本のバーコード（EAN-13 の ISBN）を読む。
 * ブラウザに BarcodeDetector があればそれを使い、なければ（iPhone の Safari など）zxing-wasm で読む。
 * zxing-wasm の本体（wasm）は外部の CDN からではなく、このサイトから配る
 */

export type BarcodeReader = (source: HTMLVideoElement) => Promise<string[]>

type Detector = {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>
}
type DetectorClass = {
  new (options: { formats: string[] }): Detector
  getSupportedFormats: () => Promise<string[]>
}

async function nativeDetector(): Promise<Detector | null> {
  const Native = (globalThis as { BarcodeDetector?: DetectorClass })
    .BarcodeDetector
  if (!Native) return null
  try {
    const formats = await Native.getSupportedFormats()
    return formats.includes('ean_13')
      ? new Native({ formats: ['ean_13'] })
      : null
  } catch {
    return null
  }
}

async function wasmDetector(): Promise<Detector> {
  // サーバー側のバンドルに wasm を入れない（読み取りはブラウザでしか動かさない）
  if (import.meta.env.SSR) throw new Error('ブラウザでだけ使えます')
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] =
    await Promise.all([
      import('barcode-detector/ponyfill'),
      import('zxing-wasm/reader/zxing_reader.wasm?url'),
    ])
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith('.wasm') ? wasmUrl : prefix + path,
    },
  })
  return new BarcodeDetector({ formats: ['ean_13'] })
}

/** 読み取りの準備をする（wasm のときは本体を読み込む） */
export async function createBarcodeReader(): Promise<BarcodeReader> {
  const detector = (await nativeDetector()) ?? (await wasmDetector())
  return async (source) =>
    (await detector.detect(source)).map((barcode) => barcode.rawValue)
}

/**
 * 読んだ値のうち、本の ISBN（978・979 で始まり、チェックディジットが合う 13 桁）を返す。
 * 本の裏には値段などの 2 段目のバーコード（192 で始まる）もあるので、それは除く
 */
export function pickIsbn(values: string[]): string | null {
  for (const value of values) {
    if (!/^97[89]\d{10}$/.test(value)) continue
    const sum = value
      .slice(0, 12)
      .split('')
      .reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0)
    if ((10 - (sum % 10)) % 10 === Number(value[12])) return value
  }
  return null
}
