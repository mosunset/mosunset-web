import { Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { CopyButton, Stat, VoiceButton } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useSpeechRecognition } from '@/hooks/use-speech-recognition'

// 見た目どおりの 1 文字（絵文字や結合文字もひとまとまり）で数える
const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('ja', { granularity: 'grapheme' })
    : null

function countGraphemes(text: string) {
  if (!segmenter) return Array.from(text).length
  let n = 0
  for (const _ of segmenter.segment(text)) n++
  return n
}

/** Shift_JIS のバイト数（概算）。ASCII と半角カナは 1 バイト、それ以外は 2 バイト */
function shiftJisBytes(text: string) {
  let bytes = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (ch === '\n')
      bytes += 2 // Windows の改行（CR+LF）として数える
    else if (code <= 0x7f || (code >= 0xff61 && code <= 0xff9f)) bytes += 1
    else bytes += 2
  }
  return bytes
}

function analyze(text: string) {
  const normalized = text.replace(/\r\n?/g, '\n')
  const lines = normalized === '' ? 0 : normalized.split('\n').length
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .filter((p) => p.trim() !== '').length
  const chars = countGraphemes(normalized)
  const noNewline = countGraphemes(normalized.replace(/\n/g, ''))
  const noSpace = countGraphemes(normalized.replace(/\s/g, ''))
  return {
    chars,
    noNewline,
    noSpace,
    lines,
    paragraphs,
    /** 400 字詰め原稿用紙（改行を除いた文字数で概算） */
    manuscript: noNewline === 0 ? 0 : Math.ceil(noNewline / 400),
    utf8: new TextEncoder().encode(normalized).length,
    // JavaScript の文字列は UTF-16 なので、長さ × 2 がそのままバイト数（BOM なし）
    utf16: normalized.length * 2,
    sjis: shiftJisBytes(normalized),
  }
}

export function CharacterCount() {
  const [text, setText] = useState('')
  const voice = useSpeechRecognition((t) => setText((prev) => prev + t))
  const s = useMemo(() => analyze(text), [text])
  const fmt = (n: number) => n.toLocaleString('ja-JP')

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <VoiceButton
            supported={voice.supported}
            listening={voice.listening}
            onToggle={voice.toggle}
          />
          <CopyButton value={text} label="テキストをコピー" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!text}
            onClick={() => setText('')}
          >
            <Trash2 />
            クリア
          </Button>
          {(voice.listening || voice.error) && (
            <span
              className={
                voice.error
                  ? 'text-sm text-destructive'
                  : 'text-sm text-primary'
              }
            >
              {voice.error ?? `聞き取り中…${voice.interim}`}
            </span>
          )}
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ここに文章を入力・貼り付け"
          rows={10}
          className="min-h-60 font-[inherit]"
        />
        <p className="text-xs text-muted-foreground">
          入力した文章はブラウザの中だけで数え、サーバーには送りません。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="文字数" value={fmt(s.chars)} unit="文字" />
        <Stat label="改行を除く" value={fmt(s.noNewline)} unit="文字" />
        <Stat label="改行・空白を除く" value={fmt(s.noSpace)} unit="文字" />
        <Stat label="行数" value={fmt(s.lines)} unit="行" />
        <Stat
          label="段落数"
          value={fmt(s.paragraphs)}
          unit="段落"
          hint="空行で区切ったまとまり"
        />
        <Stat
          label="原稿用紙"
          value={fmt(s.manuscript)}
          unit="枚"
          hint="400 字詰めで換算"
        />
      </div>

      <div>
        <h2 className="text-sm font-medium">バイト数</h2>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <Stat label="UTF-8" value={fmt(s.utf8)} unit="B" />
          <Stat label="UTF-16" value={fmt(s.utf16)} unit="B" />
          <Stat
            label="Shift_JIS"
            value={fmt(s.sjis)}
            unit="B"
            hint="概算・改行は 2 B"
          />
        </div>
      </div>
    </div>
  )
}
