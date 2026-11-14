import { ArrowLeftRight, Download, ImageIcon, Info, Trash2 } from 'lucide-react'
import type * as React from 'react'
import { useEffect, useState } from 'react'

import { CopyButton, HelpTip } from '@/components/playground/parts'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  bytesToText,
  type Charset,
  charsetLabel,
  DecodeError,
  detectImageMime,
  extensionFor,
  hexToBytes,
  htmlDecode,
  htmlEncode,
  textToBytes,
  unicodeDecode,
  unicodeEncode,
  urlDecode,
  urlEncode,
} from './codecs'
import { FileToBase64 } from './file-to-base64'

type Mode = 'base64' | 'url' | 'html' | 'unicode' | 'hex'

const modes: { value: Mode; label: string; encodedLabel: string }[] = [
  { value: 'base64', label: 'Base64', encodedLabel: 'Base64' },
  { value: 'url', label: 'URL エンコード', encodedLabel: 'URL エンコード' },
  {
    value: 'html',
    label: 'HTML エンティティ',
    encodedLabel: 'HTML エンティティ',
  },
  {
    value: 'unicode',
    label: 'Unicode エスケープ',
    encodedLabel: 'Unicode エスケープ',
  },
  { value: 'hex', label: '16 進数', encodedLabel: '16 進数' },
]

/** バイト列を通すモード（文字コードを選べる） */
const byteModes: readonly Mode[] = ['base64', 'url', 'hex']

type Options = {
  mode: Mode
  charset: Charset
  b64UrlSafe: boolean
  b64Padding: boolean
  urlMode: 'component' | 'uri'
  urlPlus: boolean
  htmlTarget: 'basic' | 'all'
  htmlNumeric: 'hex' | 'dec'
  uniTarget: 'nonascii' | 'all'
  uniStyle: 'u4' | 'brace'
  hexUpper: boolean
  hexSpace: boolean
}

const initialOptions: Options = {
  mode: 'base64',
  charset: 'utf-8',
  b64UrlSafe: false,
  b64Padding: true,
  urlMode: 'component',
  urlPlus: false,
  htmlTarget: 'basic',
  htmlNumeric: 'hex',
  uniTarget: 'nonascii',
  uniStyle: 'u4',
  hexUpper: false,
  hexSpace: true,
}

type Side = 'plain' | 'encoded'

type State = {
  opts: Options
  /** 最後に入力した側。もう一方はそこから計算する */
  side: Side
  plain: string
  encoded: string
  error?: string
  warning?: string
  /** デコードした結果がテキストでない・画像のときのバイト列 */
  binary?: { bytes: Uint8Array; mime?: string; isText: boolean }
}

function encode(text: string, o: Options): { text: string; warning?: string } {
  const unmappableWarning = (chars: string[]) =>
    chars.length > 0
      ? `Shift_JIS にない文字 ${chars
          .slice(0, 10)
          .map((c) => `「${c}」`)
          .join('')}${chars.length > 10 ? ' など' : ''} は「?」にしました`
      : undefined
  switch (o.mode) {
    case 'base64':
    case 'hex': {
      const { bytes, unmappable } = textToBytes(text, o.charset)
      return {
        text:
          o.mode === 'base64'
            ? bytesToBase64(bytes, {
                urlSafe: o.b64UrlSafe,
                padding: o.b64Padding,
              })
            : bytesToHex(bytes, {
                upper: o.hexUpper,
                separator: o.hexSpace ? ' ' : '',
              }),
        warning: unmappableWarning(unmappable),
      }
    }
    case 'url': {
      const r = urlEncode(text, { mode: o.urlMode, plus: o.urlPlus }, o.charset)
      return { text: r.text, warning: unmappableWarning(r.unmappable) }
    }
    case 'html':
      return {
        text: htmlEncode(text, {
          target: o.htmlTarget,
          numeric: o.htmlNumeric,
        }),
      }
    case 'unicode':
      return {
        text: unicodeEncode(text, { target: o.uniTarget, style: o.uniStyle }),
      }
  }
}

function decode(
  text: string,
  o: Options,
): Pick<State, 'plain' | 'binary' | 'warning'> {
  switch (o.mode) {
    case 'base64':
    case 'hex': {
      const r =
        o.mode === 'base64'
          ? base64ToBytes(text)
          : { bytes: hexToBytes(text), mime: undefined }
      const plain = bytesToText(r.bytes, o.charset)
      const image = detectImageMime(r.bytes)
      const mime = image ?? r.mime
      if (plain !== null && !image) return { plain }
      return {
        plain: plain ?? '',
        binary: { bytes: r.bytes, mime, isText: plain !== null },
        warning:
          plain === null && !image
            ? `${charsetLabel[o.charset]} のテキストとしては読めないデータ（${r.bytes.length.toLocaleString('ja-JP')} バイト）です。ファイルのデータなら下から保存できます。文字化けしているときは文字コードを切り替えてみてください`
            : undefined,
      }
    }
    case 'url':
      return {
        plain: urlDecode(text, { mode: o.urlMode, plus: o.urlPlus }, o.charset),
      }
    case 'html':
      return { plain: htmlDecode(text) }
    case 'unicode':
      return { plain: unicodeDecode(text) }
  }
}

/** side の側の text をもとに、もう一方を計算した State を作る */
function run(opts: Options, side: Side, text: string, prev: State): State {
  const base = { opts, side, plain: prev.plain, encoded: prev.encoded }
  try {
    if (side === 'plain') {
      const r = encode(text, opts)
      return { ...base, plain: text, encoded: r.text, warning: r.warning }
    }
    if (text.trim() === '') return { ...base, encoded: text, plain: '' }
    return { ...base, encoded: text, ...decode(text, opts) }
  } catch (e) {
    const message =
      e instanceof DecodeError
        ? e.message
        : 'うまく変換できませんでした。入力を確かめてください'
    // 計算できなかった側は、最後にうまくいったときの内容のまま残す
    return side === 'plain'
      ? { ...base, plain: text, error: message }
      : { ...base, encoded: text, error: message }
  }
}

const sample = 'こんにちは、世界！ Hello, World! 🍣'

const emptyState: State = {
  opts: initialOptions,
  side: 'plain',
  plain: '',
  encoded: '',
}

export function EncodeDecode() {
  const [state, setState] = useState<State>(() =>
    run(initialOptions, 'plain', sample, emptyState),
  )
  const o = state.opts
  const mode = modes.find((m) => m.value === o.mode) ?? modes[0]

  /** 出力の形だけに効く設定は、元のテキストからエンコードし直す */
  const setEncodeOption = (patch: Partial<Options>) =>
    setState((s) => run({ ...s.opts, ...patch }, 'plain', s.plain, s))
  /** 読み方にも効く設定（文字コード・+ の扱い）は、最後に入力した側から計算し直す */
  const setReadOption = (patch: Partial<Options>) =>
    setState((s) =>
      run(
        { ...s.opts, ...patch },
        s.side,
        s.side === 'plain' ? s.plain : s.encoded,
        s,
      ),
    )

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Segmented
          label="変換の種類"
          hideLabel
          value={o.mode}
          options={modes}
          onChange={(mode) => setEncodeOption({ mode })}
          className="w-full sm:w-auto"
        />
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <ModeOptions
            opts={o}
            setEncodeOption={setEncodeOption}
            setReadOption={setReadOption}
          />
          {byteModes.includes(o.mode) && (
            <Segmented
              label="文字コード"
              help="テキストをバイト列にするときの文字コードです。日本語は UTF-8 がふつうですが、古いシステムや Windows のファイルでは Shift_JIS が使われていることがあります。デコードして文字化けするときは切り替えてみてください。"
              value={o.charset}
              options={[
                { value: 'utf-8', label: 'UTF-8' },
                { value: 'shift_jis', label: 'Shift_JIS' },
              ]}
              onChange={(charset) => setReadOption({ charset })}
            />
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
        <Panel
          label="元のテキスト"
          active={state.side === 'plain'}
          value={state.plain}
          placeholder="変換したいテキストを入力・貼り付け"
          onChange={(v) => setState((s) => run(s.opts, 'plain', v, s))}
          onClear={() => setState((s) => run(s.opts, 'plain', '', s))}
        />
        <div className="flex items-center justify-center text-muted-foreground">
          <ArrowLeftRight className="size-5 rotate-90 md:rotate-0" />
        </div>
        <Panel
          label={mode.encodedLabel}
          active={state.side === 'encoded'}
          value={state.encoded}
          placeholder={`${mode.encodedLabel} の文字列を入れると、左に元のテキストを出します`}
          onChange={(v) => setState((s) => run(s.opts, 'encoded', v, s))}
          onClear={() => setState((s) => run(s.opts, 'encoded', '', s))}
          mono
        />
      </div>

      {state.error && (
        <Notice tone="error">
          {state.side === 'encoded' ? 'デコードできませんでした: ' : ''}
          {state.error}
        </Notice>
      )}
      {!state.error && state.warning && (
        <Notice tone="warning">{state.warning}</Notice>
      )}
      {!state.error && state.side === 'encoded' && state.binary && (
        <BinaryPreview binary={state.binary} />
      )}

      <p className="text-xs text-muted-foreground">
        左右どちらに入力しても、もう一方にすぐ変換します。変換はすべてブラウザの中で行い、入力した内容やファイルはサーバーに送りません。
      </p>

      <FileToBase64 urlSafe={o.b64UrlSafe} padding={o.b64Padding} />
    </div>
  )
}

function ModeOptions({
  opts: o,
  setEncodeOption,
  setReadOption,
}: {
  opts: Options
  setEncodeOption: (patch: Partial<Options>) => void
  setReadOption: (patch: Partial<Options>) => void
}) {
  switch (o.mode) {
    case 'base64':
      return (
        <>
          <Segmented
            label="種類"
            help="URL-safe は、URL やファイル名で困る「+」「/」を「-」「_」に置き換えた形です（JWT などで使います）。デコードはどちらの形でも読めます。"
            value={o.b64UrlSafe ? 'url' : 'std'}
            options={[
              { value: 'std', label: '標準 (+/)' },
              { value: 'url', label: 'URL-safe (-_)' },
            ]}
            onChange={(v) => setEncodeOption({ b64UrlSafe: v === 'url' })}
          />
          <Segmented
            label="パディング"
            help="長さを 4 の倍数にそろえるために末尾に付ける「=」です。デコードは「=」があってもなくても読めます。"
            value={o.b64Padding ? 'on' : 'off'}
            options={[
              { value: 'on', label: '= あり' },
              { value: 'off', label: 'なし' },
            ]}
            onChange={(v) => setEncodeOption({ b64Padding: v === 'on' })}
          />
        </>
      )
    case 'url':
      return (
        <>
          <Segmented
            label="方式"
            help={
              <>
                encodeURIComponent は、クエリの値などの「部品」用で、: / ? #
                &amp; = なども変換します。encodeURI は URL 全体用で、URL
                の区切りに使う記号をそのまま残します。
              </>
            }
            value={o.urlMode}
            options={[
              { value: 'component', label: 'encodeURIComponent' },
              { value: 'uri', label: 'encodeURI' },
            ]}
            onChange={(urlMode) => setEncodeOption({ urlMode })}
          />
          <Segmented
            label="空白"
            help="フォームの送信（application/x-www-form-urlencoded）では、空白を「+」にします。「+」を選ぶと、デコードでも「+」を空白として読みます。"
            value={o.urlPlus ? 'plus' : '20'}
            options={[
              { value: '20', label: '%20' },
              { value: 'plus', label: '+' },
            ]}
            onChange={(v) => setReadOption({ urlPlus: v === 'plus' })}
          />
        </>
      )
    case 'html':
      return (
        <>
          <Segmented
            label="変換する文字"
            help="「記号だけ」は HTML で意味を持つ & < > &quot; ' だけを変換します。「日本語なども」は ASCII 以外の文字も数値文字参照（&#x3042; など）にします。デコードは &amp;nbsp; などの名前付きも読めます。"
            value={o.htmlTarget}
            options={[
              { value: 'basic', label: '記号だけ' },
              { value: 'all', label: '日本語なども' },
            ]}
            onChange={(htmlTarget) => setEncodeOption({ htmlTarget })}
          />
          {o.htmlTarget === 'all' && (
            <Segmented
              label="書き方"
              value={o.htmlNumeric}
              options={[
                { value: 'hex', label: '16 進 &#x3042;' },
                { value: 'dec', label: '10 進 &#12354;' },
              ]}
              onChange={(htmlNumeric) => setEncodeOption({ htmlNumeric })}
            />
          )}
        </>
      )
    case 'unicode':
      return (
        <>
          <Segmented
            label="変換する文字"
            value={o.uniTarget}
            options={[
              { value: 'nonascii', label: 'ASCII 以外' },
              { value: 'all', label: 'すべて' },
            ]}
            onChange={(uniTarget) => setEncodeOption({ uniTarget })}
          />
          <Segmented
            label="書き方"
            help="\uXXXX は JSON や JavaScript で使える形で、絵文字などは 2 つ（サロゲートペア）に分かれます。\u{XXXXX} は JavaScript（ES2015 以降）の形で、1 文字を 1 つで書けます。デコードはどちらも、\xXX も読めます。"
            value={o.uniStyle}
            options={[
              { value: 'u4', label: '\\uXXXX' },
              { value: 'brace', label: '\\u{XXXXX}' },
            ]}
            onChange={(uniStyle) => setEncodeOption({ uniStyle })}
          />
        </>
      )
    case 'hex':
      return (
        <>
          <Segmented
            label="英字"
            value={o.hexUpper ? 'upper' : 'lower'}
            options={[
              { value: 'lower', label: 'e3 81' },
              { value: 'upper', label: 'E3 81' },
            ]}
            onChange={(v) => setEncodeOption({ hexUpper: v === 'upper' })}
          />
          <Segmented
            label="区切り"
            help="デコードは、空白・改行・「:」「-」や、0x・\x の前置きがあっても読めます。"
            value={o.hexSpace ? 'space' : 'none'}
            options={[
              { value: 'space', label: '空白' },
              { value: 'none', label: 'なし' },
            ]}
            onChange={(v) => setEncodeOption({ hexSpace: v === 'space' })}
          />
        </>
      )
  }
}

/** 選択肢をボタンで並べる切り替え（ハッシュ生成ツールの出力形式と同じ見た目） */
function Segmented<T extends string>({
  label,
  hideLabel = false,
  help,
  value,
  options,
  onChange,
  className,
}: {
  label: string
  hideLabel?: boolean
  help?: React.ReactNode
  value: T
  options: readonly { value: T; label: React.ReactNode }[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!hideLabel && (
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          {label}
          {help && <HelpTip>{help}</HelpTip>}
        </span>
      )}
      <fieldset
        className={cn(
          'inline-flex flex-wrap rounded-md border p-0.5',
          className,
        )}
      >
        <legend className="sr-only">{label}</legend>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded px-3 py-1 text-xs text-muted-foreground hover:text-foreground',
              value === opt.value && 'bg-muted font-medium text-foreground',
            )}
          >
            {opt.label}
          </button>
        ))}
      </fieldset>
    </div>
  )
}

function Panel({
  label,
  active,
  value,
  placeholder,
  onChange,
  onClear,
  mono = false,
}: {
  label: string
  active: boolean
  value: string
  placeholder: string
  onChange: (value: string) => void
  onClear: () => void
  mono?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {label}
          {active && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-normal text-primary">
              入力中
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs tabular-nums text-muted-foreground">
            {value.length.toLocaleString('ja-JP')} 文字
          </span>
          <CopyButton value={value} size="icon" label={`${label}をコピー`} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${label}を消す`}
            title="消す"
            disabled={!value}
            onClick={onClear}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={8}
        spellCheck={false}
        className={cn(
          'min-h-48 flex-1 break-all',
          mono ? 'font-mono' : 'font-[inherit]',
        )}
      />
    </div>
  )
}

function Notice({
  tone,
  children,
}: {
  tone: 'error' | 'warning'
  children: React.ReactNode
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex gap-2 rounded-lg border p-3 text-sm leading-relaxed',
        tone === 'error'
          ? 'border-destructive/40 bg-destructive/5 text-destructive'
          : 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300',
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  )
}

/** デコードしたバイト列の画像プレビューと保存 */
function BinaryPreview({ binary }: { binary: NonNullable<State['binary']> }) {
  const [url, setUrl] = useState<string | null>(null)
  const isImage = binary.mime?.startsWith('image/') ?? false

  useEffect(() => {
    const blob = new Blob([binary.bytes as Uint8Array<ArrayBuffer>], {
      type: binary.mime ?? 'application/octet-stream',
    })
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [binary])

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ImageIcon className="size-4 text-muted-foreground" />
          {isImage ? '画像のプレビュー' : 'デコードしたデータ'}
          <span className="text-xs font-normal text-muted-foreground">
            {binary.mime ?? '種類不明'}・
            {binary.bytes.length.toLocaleString('ja-JP')} バイト
          </span>
        </div>
        {url && (
          <Button asChild variant="outline" size="sm">
            <a href={url} download={`decoded.${extensionFor(binary.mime)}`}>
              <Download />
              ファイルとして保存
            </a>
          </Button>
        )}
      </div>
      {isImage && url && (
        <div className="flex justify-center rounded-md bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-3">
          <img
            src={url}
            alt="デコードした画像"
            className="max-h-80 max-w-full object-contain"
          />
        </div>
      )}
    </div>
  )
}
