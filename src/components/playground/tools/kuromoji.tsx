import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { CopyButton, VoiceButton } from '@/components/playground/parts'
import { Textarea } from '@/components/ui/textarea'
import { useSpeechRecognition } from '@/hooks/use-speech-recognition'
import { cn } from '@/lib/utils'

// public/playground/kuromoji/ に置いた、ブラウザ用にまとめ済みの kuromoji.js と辞書を使う
const SCRIPT = '/playground/kuromoji/kuromoji.js'
const DICT = '/playground/kuromoji/dict'

type Token = {
  word_position: number
  surface_form: string
  pos: string
  pos_detail_1: string
  pos_detail_2: string
  pos_detail_3: string
  conjugated_type: string
  conjugated_form: string
  basic_form: string
  reading?: string
  pronunciation?: string
  word_id: number
  word_type: string
}
type Tokenizer = { tokenize: (text: string) => Token[] }
type KuromojiGlobal = {
  builder: (o: { dicPath: string }) => {
    build: (cb: (err: Error | null, t: Tokenizer) => void) => void
  }
}

let tokenizerPromise: Promise<Tokenizer> | null = null

/** スクリプトと辞書（約 17MB）は、このページを開いたときに 1 度だけ読み込む */
function loadTokenizer() {
  tokenizerPromise ??= new Promise<Tokenizer>((resolve, reject) => {
    const build = () => {
      const k = (window as unknown as { kuromoji?: KuromojiGlobal }).kuromoji
      if (!k) return reject(new Error('kuromoji を読み込めませんでした'))
      k.builder({ dicPath: DICT }).build((err, t) =>
        err ? reject(err) : resolve(t),
      )
    }
    if ((window as unknown as { kuromoji?: unknown }).kuromoji) return build()
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = build
    script.onerror = () => reject(new Error('kuromoji を読み込めませんでした'))
    document.head.appendChild(script)
  }).catch((e) => {
    tokenizerPromise = null
    throw e
  })
  return tokenizerPromise
}

const posColors: Record<string, string> = {
  名詞: 'bg-sky-500/15 border-sky-500/40',
  動詞: 'bg-rose-500/15 border-rose-500/40',
  形容詞: 'bg-amber-500/15 border-amber-500/40',
  副詞: 'bg-violet-500/15 border-violet-500/40',
  助詞: 'bg-muted border-border',
  助動詞: 'bg-emerald-500/15 border-emerald-500/40',
  記号: 'bg-transparent border-dashed border-border',
}

const kataToHira = (s: string) =>
  s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))

const columns: { key: keyof Token; label: string }[] = [
  { key: 'surface_form', label: '表層形' },
  { key: 'pos', label: '品詞' },
  { key: 'pos_detail_1', label: '細分類 1' },
  { key: 'pos_detail_2', label: '細分類 2' },
  { key: 'pos_detail_3', label: '細分類 3' },
  { key: 'conjugated_type', label: '活用型' },
  { key: 'conjugated_form', label: '活用形' },
  { key: 'basic_form', label: '基本形' },
  { key: 'reading', label: '読み' },
  { key: 'pronunciation', label: '発音' },
  { key: 'word_position', label: '位置' },
  { key: 'word_id', label: 'ID' },
  { key: 'word_type', label: '種別' },
]

export function Kuromoji() {
  const [tokenizer, setTokenizer] = useState<Tokenizer | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [text, setText] = useState(
    'すもももももももものうち。東京スカイツリーへ歩いて行った。',
  )
  const voice = useSpeechRecognition((t) => setText((prev) => prev + t))

  useEffect(() => {
    loadTokenizer()
      .then(setTokenizer)
      .catch((e: Error) => setLoadError(e.message))
  }, [])

  const tokens = useMemo(
    () => (tokenizer ? tokenizer.tokenize(text) : []),
    [tokenizer, text],
  )
  const wakati = tokens.map((t) => t.surface_form).join(' ')
  const reading = kataToHira(
    tokens.map((t) => t.reading ?? t.surface_form).join(''),
  )
  const posCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of tokens) m.set(t.pos, (m.get(t.pos) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [tokens])

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <VoiceButton
            supported={voice.supported}
            listening={voice.listening}
            onToggle={voice.toggle}
          />
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
          rows={4}
          placeholder="解析したい日本語の文章"
        />
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
            <h2 className="text-sm font-medium">品詞ごとの色分け</h2>
            <div className="flex flex-wrap gap-1.5 leading-loose">
              {tokens.map((t) => (
                <span
                  key={`${t.word_position}-${t.surface_form}`}
                  title={`${t.pos}${t.pos_detail_1 !== '*' ? `・${t.pos_detail_1}` : ''} / 基本形: ${t.basic_form}`}
                  className={cn(
                    'rounded border px-1.5',
                    posColors[t.pos] ?? 'border-border',
                  )}
                >
                  <ruby>
                    {t.surface_form}
                    <rt className="text-[0.6rem] text-muted-foreground">
                      {t.reading && t.reading !== t.surface_form
                        ? kataToHira(t.reading)
                        : ''}
                    </rt>
                  </ruby>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {posCounts.map(([pos, n]) => (
                <span
                  key={pos}
                  className={cn(
                    'rounded border px-2 py-0.5',
                    posColors[pos] ?? 'border-border',
                  )}
                >
                  {pos} {n}
                </span>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <Output label="分かち書き" value={wakati} />
            <Output label="読み（ひらがな）" value={reading} />
          </section>

          <details className="rounded-lg border">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              すべての項目を表で見る（{tokens.length} 語）
            </summary>
            <div className="overflow-x-auto border-t">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    {columns.map((c) => (
                      <th key={c.key} className="px-3 py-2 font-medium">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tokens.map((t) => (
                    <tr key={`${t.word_position}-${t.surface_form}`}>
                      {columns.map((c) => (
                        <td key={c.key} className="px-3 py-1.5">
                          {String(t[c.key] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  )
}

function Output({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <CopyButton value={value} size="icon" label={`${label}をコピー`} />
      </div>
      <p className="break-all text-sm">{value}</p>
    </div>
  )
}
