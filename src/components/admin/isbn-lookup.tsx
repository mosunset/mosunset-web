import { useServerFn } from '@tanstack/react-start'
import { Loader2, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { lookupIsbn } from '@/functions/isbn'
import { useThumbnailMaker } from '@/hooks/use-image-upload'
import type { CollectionAttributes } from '@/lib/collections'
import { errorMessage } from '@/lib/errors'
import type { RichTextDoc } from '@/lib/tiptap'

export type IsbnResult = Awaited<ReturnType<typeof lookupIsbn>>

/** ISBN の検索結果を入れる先（本の入力欄のうち関係するもの） */
type IsbnTarget = {
  title: string
  imageKey: string | null
  attributes: CollectionAttributes
  description: RichTextDoc
}

/** 文字が 1 つもない本文か（画像などの中身もないもの） */
function isBlankDoc(node: RichTextDoc): boolean {
  if (node.text?.trim()) return false
  if (
    node.type &&
    !['doc', 'paragraph', 'hardBreak', 'text'].includes(node.type)
  ) {
    return false
  }
  return (node.content ?? []).every(isBlankDoc)
}

/** 内容紹介のテキストを、段落ごとに分けた本文にする */
function textToDoc(text: string): RichTextDoc {
  return {
    type: 'doc',
    content: text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: line }],
      })),
  }
}

/**
 * ISBN の検索結果を、空いている項目にだけ入れる。
 * 新しい入力内容と、入れた項目の名前（書名・著者など）を返す
 */
export function mergeIsbnResult<T extends IsbnTarget>(
  fields: T,
  result: IsbnResult,
): { fields: T; filled: string[] } {
  const filled: string[] = []
  const attributes: CollectionAttributes = {
    ...fields.attributes,
    isbn: result.isbn,
  }
  const next: T = { ...fields, attributes }
  if (!fields.title.trim() && result.title) {
    next.title = result.title
    filled.push('書名')
  }
  if (!attributes.author && result.author) {
    attributes.author = result.author
    filled.push('著者')
  }
  if (!attributes.publisher && result.publisher) {
    attributes.publisher = result.publisher
    filled.push('出版社')
  }
  if (!attributes.publishedDate && result.publishedDate) {
    attributes.publishedDate = result.publishedDate
    filled.push('発行日')
  }
  if (isBlankDoc(fields.description) && result.description) {
    next.description = textToDoc(result.description)
    filled.push('内容紹介')
  }
  if (!fields.imageKey && result.imageKey) {
    next.imageKey = result.imageKey
    filled.push('表紙')
  }
  return { fields: next, filled }
}

/** ISBN の入力欄。「検索」で書誌情報と表紙を取ってくる */
export function IsbnInput({
  value,
  onChange,
  needCover,
  onFound,
  autoSearch = false,
}: {
  value: string
  onChange: (value: string) => void
  /** まだ写真がないときだけ表紙を取りにいく */
  needCover: boolean
  onFound: (result: IsbnResult) => void
  /** 画面を開いたときに 1 度だけ検索する（バーコードで読んだ本を登録するとき） */
  autoSearch?: boolean
}) {
  const lookup = useServerFn(lookupIsbn)
  const makeThumbnail = useThumbnailMaker()
  const [pending, setPending] = useState(false)

  const search = async () => {
    if (!value.trim()) {
      toast.error('ISBN を入力してください')
      return
    }
    setPending(true)
    try {
      const result = await lookup({
        data: { isbn: value, withCover: needCover },
      })
      onFound(result)
      // 取ってきた表紙はサーバーで保存されるので、一覧用の小さい画像はここで作る
      // （作れなくても一覧には元の画像が出るので、失敗は知らせない）
      if (result.imageKey) makeThumbnail(result.imageKey).catch(() => {})
    } catch (e) {
      toast.error(errorMessage(e, '本の情報を取得できませんでした'))
    } finally {
      setPending(false)
    }
  }

  const autoSearched = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: 開いたときの 1 回だけ
  useEffect(() => {
    if (!autoSearch || autoSearched.current) return
    autoSearched.current = true
    search()
  }, [])

  return (
    <div className="space-y-2">
      <Label htmlFor="attr-isbn">ISBN</Label>
      <div className="flex gap-2">
        <Input
          id="attr-isbn"
          value={value}
          inputMode="numeric"
          placeholder="978-4-..."
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // フォームの送信（保存）ではなく検索にする
            if (e.key === 'Enter') {
              e.preventDefault()
              search()
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={search}
          title="ISBN から書名・著者・出版社・表紙を入れる"
        >
          {pending ? <Loader2 className="animate-spin" /> : <Search />}
          検索
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        検索すると、空いている項目に書名・著者・出版社・発行日・内容紹介・表紙を入れます（openBD・楽天ブックス・Google
        Books）
      </p>
    </div>
  )
}
