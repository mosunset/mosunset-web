import { Loader2, RotateCcw, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { CopyButton, HelpTip } from '@/components/playground/parts'
import {
  loadTokenizer,
  type Tokenizer,
} from '@/components/playground/tools/kuromoji'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import {
  buildSegments,
  formatOutput,
  type OutputFormat,
  type Segment,
  showRuby,
} from './ruby'

/** ルビを付ける漢字の範囲。数字は「この段階以上の漢字を含む語に付ける」 */
const levels = [
  { value: 1, label: 'すべての漢字' },
  { value: 2, label: '2 年生以上で習う漢字' },
  { value: 3, label: '3 年生以上で習う漢字' },
  { value: 4, label: '4 年生以上で習う漢字' },
  { value: 5, label: '5 年生以上で習う漢字' },
  { value: 6, label: '6 年生で習う漢字と、それより難しい漢字' },
  { value: 7, label: '中学校以上で習う漢字（小学校の漢字は除く）' },
  { value: 8, label: '常用漢字以外の漢字だけ' },
]

const formats: { value: OutputFormat; label: string; example: string }[] = [
  {
    value: 'html',
    label: 'HTML',
    example: '<ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>',
  },
  { value: 'paren', label: '括弧', example: '漢字(かんじ)' },
  { value: 'aozora', label: '青空文庫', example: '｜漢字《かんじ》' },
]

export function Furigana() {
  const [tokenizer, setTokenizer] = useState<Tokenizer | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [text, setText] = useState(
    '今日は天気が良いので、友達と公園へ遊びに行きました。\n庭に薔薇の花が綺麗に咲いていて、みんなで写真を撮りました。',
  )
  const [minLevel, setMinLevel] = useState(1)
  const [format, setFormat] = useState<OutputFormat>('html')
  /** 手で直した読み（鍵は Segment.key） */
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    loadTokenizer()
      .then(setTokenizer)
      .catch((e: Error) => setLoadError(e.message))
  }, [])

  const tokens = useMemo(
    () => (tokenizer ? tokenizer.tokenize(text) : []),
    [tokenizer, text],
  )
  const segments = useMemo(
    () => (tokenizer ? buildSegments(text, tokens, overrides) : []),
    [tokenizer, text, tokens, overrides],
  )
  const output = useMemo(
    () => formatOutput(segments, minLevel, format),
    [segments, minLevel, format],
  )
  const selectedSeg = segments.find((s) => s.key === selected) ?? null
  const editedCount = Object.keys(overrides).length

  const setOverride = (key: string, value: string | undefined) =>
    setOverrides((prev) => {
      const next = { ...prev }
      if (value === undefined) delete next[key]
      else next[key] = value
      return next
    })

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="furigana-text">ふりがなを付ける文章</Label>
        <Textarea
          id="furigana-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="ここに日本語の文章を入れてください"
        />
        <p className="text-xs text-muted-foreground">
          読みの計算はすべてブラウザの中で行い、入力した文章はサーバーに送りません。
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="furigana-level" className="flex items-center gap-1">
          ルビを付ける漢字
          <HelpTip>
            えらんだ学年より前に習う漢字だけでできた語には、ルビを付けません。学年は小学校の学年別漢字配当表をもとにした目安です。
          </HelpTip>
        </Label>
        <select
          id="furigana-level"
          value={minLevel}
          onChange={(e) => setMinLevel(Number(e.target.value))}
          className="h-10 w-full max-w-sm rounded-lg border bg-transparent px-2.5 text-base md:h-8 md:text-sm"
        >
          {levels.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      {loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : !tokenizer ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          辞書を読み込んでいます（初回のみ・約 17MB）…
        </p>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium">プレビュー</h2>
              {editedCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setOverrides({})
                    setSelected(null)
                  }}
                >
                  <RotateCcw />
                  直した読みをすべて戻す（{editedCount} 語）
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              読みがちがう語は、クリックすると直せます。点線の語は辞書に読みがない語です。
            </p>
            <div className="whitespace-pre-wrap break-words rounded-lg border p-4 text-lg leading-[2.4]">
              {segments.map((s, i) =>
                s.kanji ? (
                  <button
                    // biome-ignore lint/suspicious/noArrayIndexKey: 同じ語が何度も出るので位置で区別する
                    key={i}
                    type="button"
                    onClick={() => setSelected(s.key)}
                    title="クリックして読みを直す"
                    className={cn(
                      'rounded px-px hover:bg-primary/10',
                      !s.reading &&
                        'underline decoration-muted-foreground decoration-dashed underline-offset-4',
                      s.edited && 'bg-amber-500/15',
                      selected === s.key && 'bg-primary/15 ring-1 ring-primary',
                    )}
                  >
                    <SegmentRuby seg={s} minLevel={minLevel} />
                  </button>
                ) : (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 文章の並びは位置で決まる
                  <span key={i}>{s.surface}</span>
                ),
              )}
            </div>

            {selectedSeg && (
              <ReadingEditor
                seg={selectedSeg}
                value={
                  overrides[selectedSeg.key] ?? selectedSeg.dictReading ?? ''
                }
                onChange={(v) => setOverride(selectedSeg.key, v)}
                onReset={() => setOverride(selectedSeg.key, undefined)}
                onClose={() => setSelected(null)}
              />
            )}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <fieldset className="inline-flex rounded-md border p-0.5">
                <legend className="sr-only">出力の形式</legend>
                {formats.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    aria-pressed={format === f.value}
                    onClick={() => setFormat(f.value)}
                    className={cn(
                      'rounded px-3 py-1 text-xs text-muted-foreground',
                      format === f.value && 'bg-muted text-foreground',
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </fieldset>
              <CopyButton value={output} label="結果をコピー" />
            </div>
            <p className="break-all font-mono text-xs text-muted-foreground">
              形式: {formats.find((f) => f.value === format)?.example}
            </p>
            <Textarea
              value={output}
              readOnly
              rows={6}
              aria-label="ルビ付きの結果"
              className="font-mono text-sm"
            />
          </section>
        </>
      )}
    </div>
  )
}

function SegmentRuby({ seg, minLevel }: { seg: Segment; minLevel: number }) {
  return seg.parts.map((p, i) =>
    showRuby(p, minLevel) ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: 語の中の並びは位置で決まる
      <ruby key={i}>
        {p.text}
        <rp>(</rp>
        <rt className="text-[0.55em] text-muted-foreground">{p.reading}</rt>
        <rp>)</rp>
      </ruby>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: 語の中の並びは位置で決まる
      <span key={i}>{p.text}</span>
    ),
  )
}

function ReadingEditor({
  seg,
  value,
  onChange,
  onReset,
  onClose,
}: {
  seg: Segment
  value: string
  onChange: (v: string) => void
  onReset: () => void
  onClose: () => void
}) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <Label htmlFor="furigana-reading" className="leading-relaxed">
          「{seg.surface}」の読み（語全体をひらがなで）
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="閉じる"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          id="furigana-reading"
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onClose()}
          className="max-w-xs flex-1"
          placeholder="例: かんじ"
        />
        {seg.edited && (
          <Button type="button" variant="outline" onClick={onReset}>
            <RotateCcw />
            辞書の読みに戻す
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        辞書の読み: {seg.dictReading ?? '（なし）'}
        。送り仮名は自動でルビから外します。
        同じ語（辞書の読みも同じもの）はまとめて直ります。空にするとこの語にはルビを付けません。
      </p>
    </div>
  )
}
