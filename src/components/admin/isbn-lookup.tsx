import { useServerFn } from '@tanstack/react-start'
import { Loader2, Search } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CollectionAttributes } from '@/lib/collections'
import { errorMessage } from '@/lib/errors'
import { lookupIsbn } from '@/server/isbn'

export type IsbnResult = {
  isbn: string
  title: string
  author: string
  publisher: string
  imageKey: string | null
}

/** ISBN の検索結果を入れる先（本の入力欄のうち関係するもの） */
type IsbnTarget = {
  title: string
  imageKey: string | null
  attributes: CollectionAttributes
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
}: {
  value: string
  onChange: (value: string) => void
  /** まだ写真がないときだけ表紙を取りにいく */
  needCover: boolean
  onFound: (result: IsbnResult) => void
}) {
  const lookup = useServerFn(lookupIsbn)
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
    } catch (e) {
      toast.error(errorMessage(e, '本の情報を取得できませんでした'))
    } finally {
      setPending(false)
    }
  }

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
        検索すると、空いている項目に書名・著者・出版社・表紙を入れます
      </p>
    </div>
  )
}
