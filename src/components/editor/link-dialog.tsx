import type { Editor } from '@tiptap/react'
import { ExternalLink, Unlink } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** よくある書き方を正しい URL にする（example.com → https://example.com） */
function normalizeHref(value: string) {
  const v = value.trim()
  if (!v) return ''
  if (/^(https?:|mailto:|\/)/i.test(v)) return v
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`
  return `https://${v}`
}

export function LinkDialog({
  editor,
  open,
  onOpenChange,
}: {
  editor: Editor
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [href, setHref] = useState('')
  const [text, setText] = useState('')
  const [hasSelection, setHasSelection] = useState(false)

  // 開いたときに、今のリンク先と選択中の文字を読み込む
  useEffect(() => {
    if (!open) return
    const current = editor.getAttributes('link').href as string | undefined
    const { from, to } = editor.state.selection
    setHref(current ?? '')
    setText(editor.state.doc.textBetween(from, to, ' '))
    setHasSelection(from !== to || !!current)
  }, [open, editor])

  const apply = () => {
    const url = normalizeHref(href)
    const chain = editor.chain().focus().extendMarkRange('link')
    if (!url) {
      chain.unsetLink().run()
    } else if (hasSelection) {
      chain.setLink({ href: url }).run()
    } else {
      // 何も選んでいないときは、表示する文字ごと挿入する
      chain
        .insertContent({
          type: 'text',
          text: text.trim() || url,
          marks: [{ type: 'link', attrs: { href: url } }],
        })
        .run()
    }
    onOpenChange(false)
  }

  const isEditing = !!editor.getAttributes('link').href

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'リンクを編集' : 'リンクを追加'}
          </DialogTitle>
          <DialogDescription>
            URL・サイト内のパス（/blog など）・メールアドレスを入れられます。
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            apply()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="link-href">リンク先</Label>
            <Input
              id="link-href"
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="https://example.com"
              autoFocus
            />
          </div>
          {!hasSelection && (
            <div className="space-y-2">
              <Label htmlFor="link-text">表示する文字</Label>
              <Input
                id="link-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="空ならリンク先をそのまま表示"
              />
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            {isEditing && (
              <>
                <Button type="button" variant="ghost" asChild>
                  <a
                    href={normalizeHref(href)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink />
                    開く
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    editor
                      .chain()
                      .focus()
                      .extendMarkRange('link')
                      .unsetLink()
                      .run()
                    onOpenChange(false)
                  }}
                >
                  <Unlink />
                  解除
                </Button>
              </>
            )}
            <Button type="submit">{isEditing ? '更新' : '追加'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
