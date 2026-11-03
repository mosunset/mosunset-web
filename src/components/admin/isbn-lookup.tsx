import { useServerFn } from '@tanstack/react-start'
import { Loader2, Search } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/errors'
import { lookupIsbn } from '@/server/isbn'

export type IsbnResult = {
  isbn: string
  title: string
  author: string
  publisher: string
  imageKey: string | null
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
