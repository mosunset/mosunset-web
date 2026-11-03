import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ExternalLink, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { RichTextEditor } from '@/components/editor/rich-text-editor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage } from '@/lib/errors'
import { emptyDoc, type RichTextDoc } from '@/lib/tiptap'
import { deletePost, type PostInput, savePost } from '@/server/posts'

type Props = {
  /** 編集時は既存の記事。新規作成時は undefined */
  post?: {
    id: string
    title: string
    slug: string
    excerpt: string
    status: 'draft' | 'published'
    content: RichTextDoc
    publishedAt: Date | null
  }
}

export function PostForm({ post }: Props) {
  const router = useRouter()
  const save = useServerFn(savePost)
  const remove = useServerFn(deletePost)

  const [title, setTitle] = useState(post?.title ?? '')
  const [slug, setSlug] = useState(post?.slug ?? '')
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '')
  const [content, setContent] = useState<RichTextDoc>(post?.content ?? emptyDoc)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const isPublished = post?.status === 'published'

  const submit = async (status: PostInput['status']) => {
    setPending(true)
    setError(null)
    try {
      const result = await save({
        data: { id: post?.id, title, slug, excerpt, status, content },
      })
      setSavedAt(new Date())
      if (!post) {
        await router.navigate({
          to: '/admin/posts/$id',
          params: { id: result.id },
        })
      } else {
        await router.invalidate()
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  const onDelete = async () => {
    if (!post) return
    if (!window.confirm(`「${post.title}」を削除します。元に戻せません。`)) {
      return
    }
    setPending(true)
    try {
      await remove({ data: { id: post.id } })
      await router.navigate({ to: '/admin/posts' })
    } catch (e) {
      setError(errorMessage(e))
      setPending(false)
    }
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        submit(post?.status ?? 'draft')
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="title">タイトル</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-11 text-lg"
          required
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="slug">URL</Label>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span className="shrink-0">/blog/</span>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="my-first-post"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              title="半角英小文字・数字・ハイフン"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="excerpt">概要（一覧・検索結果・SNS に表示）</Label>
          <Textarea
            id="excerpt"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            maxLength={300}
            rows={2}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>本文</Label>
        <RichTextEditor value={content} onChange={setContent} />
      </div>

      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t pt-6">
        {isPublished ? (
          <>
            <Button
              type="button"
              disabled={pending}
              onClick={() => submit('published')}
            >
              更新する
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => submit('draft')}
            >
              非公開に戻す
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              disabled={pending}
              onClick={() => submit('published')}
            >
              公開する
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => submit('draft')}
            >
              下書き保存
            </Button>
          </>
        )}

        {savedAt && !pending && (
          <span className="text-sm text-muted-foreground">
            {savedAt.toLocaleTimeString('ja-JP')} に保存しました
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {isPublished && (
            <Button asChild variant="ghost">
              <Link
                to="/blog/$slug"
                params={{ slug: post.slug }}
                target="_blank"
              >
                <ExternalLink />
                公開ページ
              </Link>
            </Button>
          )}
          {post && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={pending}
              onClick={onDelete}
            >
              <Trash2 />
              削除
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}
