import { useCallback, useEffect, useRef, useState } from 'react'

// Web Speech API の型（標準の lib.dom にはまだ入っていない）
type SpeechRecognitionResultEvent = {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  onresult: ((e: SpeechRecognitionResultEvent) => void) | null
}

function getRecognitionClass(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => SpeechRecognitionLike)
    | null
}

const errorMessages: Record<string, string> = {
  'no-speech': '音声が聞き取れませんでした',
  'audio-capture': 'マイクが見つかりません',
  'not-allowed': 'マイクの使用が許可されていません',
}

/**
 * ブラウザの音声認識（日本語）。確定した文章ごとに onText を呼ぶ。
 * 対応していないブラウザ（Firefox など）では supported が false になる。
 */
export function useSpeechRecognition(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  useEffect(() => {
    const Recognition = getRecognitionClass()
    setSupported(!!Recognition)
    if (!Recognition) return
    const r = new Recognition()
    r.lang = 'ja-JP'
    r.continuous = true
    r.interimResults = true
    r.onstart = () => {
      setListening(true)
      setError(null)
    }
    r.onend = () => {
      setListening(false)
      setInterim('')
    }
    r.onerror = (e) =>
      setError(errorMessages[e.error] ?? `音声認識のエラー: ${e.error}`)
    r.onresult = (e) => {
      let temp = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) onTextRef.current(result[0].transcript)
        else temp += result[0].transcript
      }
      setInterim(temp)
    }
    recognitionRef.current = r
    return () => r.stop()
  }, [])

  const toggle = useCallback(() => {
    const r = recognitionRef.current
    if (!r) return
    if (listening) {
      r.stop()
      return
    }
    try {
      r.start()
    } catch {
      setError('音声認識を始められませんでした')
    }
  }, [listening])

  return { supported, listening, interim, error, toggle }
}
