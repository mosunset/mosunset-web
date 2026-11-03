import { useServerFn } from '@tanstack/react-start'
import { Eye, Loader2 } from 'lucide-react'
import type * as React from 'react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { errorMessage } from '@/lib/errors'
import type { RichTextDoc } from '@/lib/tiptap'
import { previewRichText } from '@/server/posts'

/** 保存前の内容を、公開ページと同じ見た目で確認する */
export function PreviewButton({
  content,
  header,
}: {
  content: RichTextDoc
  /** 本文の上に出すもの（タイトル・写真など） */
  header: React.ReactNode
}) {
  const preview = useServerFn(previewRichText)
  const [open, setOpen] = useState(false)
  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const show = async () => {
    setLoading(true)
    try {
      const result = await preview({ data: { content } })
      setHtml(result.html)
      setOpen(true)
    } catch (e) {
      toast.error(errorMessage(e, 'プレビューできませんでした'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={loading}
        onClick={show}
      >
        {loading ? <Loader2 className="animate-spin" /> : <Eye />}
        <span className="hidden sm:inline">プレビュー</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="sr-only">プレビュー</DialogTitle>
            <DialogDescription className="text-xs">
              プレビュー（まだ保存されていない内容も含みます）
            </DialogDescription>
          </DialogHeader>
          <article>
            {header}
            {html && (
              <div
                className="prose prose-neutral dark:prose-invert mt-6 max-w-none"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: サーバーで Tiptap の JSON から生成し、危険なリンクを取り除いた HTML
                dangerouslySetInnerHTML={{ __html: html }}
              />
            )}
          </article>
        </DialogContent>
      </Dialog>
    </>
  )
}
