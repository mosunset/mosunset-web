import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Wand2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'

import {
  DeleteButton,
  FormError,
  PublicPageLink,
  StickyActionBar,
} from '@/components/admin/form-parts'
import { ImageUpload } from '@/components/admin/image-upload'
import { PreviewButton } from '@/components/admin/preview-dialog'
import {
  BackupNotice,
  SaveStatus,
  UnsavedChangesGuard,
} from '@/components/admin/unsaved-changes'
import { RichTextEditor } from '@/components/editor/rich-text-editor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useLocalBackup } from '@/hooks/use-local-backup'
import { useSaveShortcut } from '@/hooks/use-save-shortcut'
import { errorMessage } from '@/lib/errors'
import { slugInputPattern, slugPattern } from '@/lib/slug'
import { emptyDoc, type RichTextDoc } from '@/lib/tiptap'
import { deletePost, type PostInput, savePost } from '@/server/posts'

type Props = {
  /** 編集時は既存の記事。新規作成時は undefined */
  post?: {
    id: string
    title: string
    slug: string
    excerpt: string
    coverImageKey: string | null
    status: 'draft' | 'published'
    content: RichTextDoc
    publishedAt: Date | null
    updatedAt: Date
  }
}

type Fields = {
  title: string
  slug: string
  excerpt: string
  coverImageKey: string | null
  content: RichTextDoc
}

/** 下書きを自動保存するまでの待ち時間 */
const AUTOSAVE_DELAY = 3000

export function PostForm({ post }: Props) {
  const router = useRouter()
  const save = useServerFn(savePost)
  const remove = useServerFn(deletePost)

  const initial = useMemo<Fields>(
    () => ({
      title: post?.title ?? '',
      slug: post?.slug ?? '',
      excerpt: post?.excerpt ?? '',
      coverImageKey: post?.coverImageKey ?? null,
      content: post?.content ?? emptyDoc,
    }),
    [post],
  )
  const [fields, setFields] = useState<Fields>(initial)
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify(initial),
  )
  const [editorKey, setEditorKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(
    post ? post.updatedAt : null,
  )
  const [error, setError] = useState<string | null>(null)

  const status = post?.status ?? 'draft'
  const isPublished = status === 'published'
  const dirty = JSON.stringify(fields) !== savedSnapshot
  const {
    backup,
    clear: clearBackup,
    dismiss: dismissBackup,
  } = useLocalBackup(`post:${post?.id ?? 'new'}`, fields, dirty)

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
    setFields((prev) => ({ ...prev, [key]: value }))

  // 保存中に重ねて保存しないための印
  const savingRef = useRef(false)
  // 自動保存に失敗したときの内容
  const failedSnapshotRef = useRef<string | null>(null)

  const submit = useCallback(
    async (
      nextStatus: PostInput['status'],
      { silent = false }: { silent?: boolean } = {},
    ): Promise<boolean> => {
      if (savingRef.current) return false
      savingRef.current = true
      setSaving(true)
      setAutoSaving(silent)
      setError(null)
      // 保存中に入力が続いても、送った時点の内容を「保存済み」とする
      const snapshot = JSON.stringify(fields)
      try {
        const result = await save({
          data: { id: post?.id, ...fields, status: nextStatus },
        })
        flushSync(() => {
          setSavedSnapshot(snapshot)
          setSavedAt(new Date())
        })
        clearBackup()
        failedSnapshotRef.current = null

        if (!silent) {
          toast.success(
            nextStatus === 'published'
              ? isPublished
                ? '更新しました'
                : '公開しました'
              : nextStatus !== status
                ? '非公開（下書き）に戻しました'
                : '下書きを保存しました',
          )
        }
        if (!post) {
          await router.navigate({
            to: '/admin/posts/$id',
            params: { id: result.id },
            replace: true,
          })
        } else if (nextStatus !== status) {
          await router.invalidate()
        }
        return true
      } catch (e) {
        const message = errorMessage(e)
        setError(message)
        // 自動保存の失敗は、入力が変わるまで繰り返さない
        if (silent) failedSnapshotRef.current = snapshot
        toast.error(silent ? `自動保存できませんでした: ${message}` : message)
        return false
      } finally {
        savingRef.current = false
        setSaving(false)
        setAutoSaving(false)
      }
    },
    [fields, post, status, isPublished, save, router, clearBackup],
  )

  // 下書きの記事は、入力が止まって少したったら自動で保存する
  const canAutosave =
    !!post &&
    !isPublished &&
    fields.title.trim() !== '' &&
    slugPattern.test(fields.slug)
  useEffect(() => {
    if (!dirty || !canAutosave) return
    if (failedSnapshotRef.current === JSON.stringify(fields)) return
    const timer = window.setTimeout(() => {
      submit('draft', { silent: true })
    }, AUTOSAVE_DELAY)
    return () => window.clearTimeout(timer)
  }, [dirty, canAutosave, submit, fields])

  // Ctrl+S: 公開中なら更新、下書きなら下書き保存
  useSaveShortcut(() => {
    submit(status)
  })

  const onDelete = async () => {
    if (!post) return
    if (!window.confirm(`「${post.title}」を削除します。元に戻せません。`)) {
      return
    }
    setSaving(true)
    try {
      await remove({ data: { id: post.id } })
      flushSync(() => setSavedSnapshot(JSON.stringify(fields)))
      clearBackup()
      toast.success('削除しました')
      await router.navigate({ to: '/admin/posts' })
    } catch (e) {
      toast.error(errorMessage(e, '削除できませんでした'))
      setSaving(false)
    }
  }

  const fillSlugFromDate = () => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    set(
      'slug',
      `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`,
    )
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        submit(status)
      }}
    >
      <UnsavedChangesGuard dirty={dirty} onSave={() => submit(status)} />

      {backup && JSON.stringify(backup.value) !== JSON.stringify(fields) && (
        <BackupNotice
          savedAt={backup.savedAt}
          onRestore={() => {
            setFields(backup.value)
            setEditorKey((k) => k + 1)
            dismissBackup()
          }}
          onDiscard={clearBackup}
        />
      )}

      <div className="space-y-2">
        <Label htmlFor="title">タイトル</Label>
        <Input
          id="title"
          value={fields.title}
          onChange={(e) => set('title', e.target.value)}
          className="h-11 text-lg"
          required
        />
      </div>

      <div className="grid gap-6 md:grid-cols-[12rem_1fr]">
        <div className="space-y-2">
          <Label>表紙（一覧・SNS に表示）</Label>
          <ImageUpload
            value={fields.coverImageKey}
            onChange={(key) => set('coverImageKey', key)}
            folder="posts"
          />
        </div>
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="slug">URL</Label>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span className="shrink-0">/blog/</span>
              <Input
                id="slug"
                value={fields.slug}
                onChange={(e) => set('slug', e.target.value.toLowerCase())}
                placeholder="my-first-post"
                pattern={slugInputPattern}
                title="半角英小文字・数字・ハイフン"
                required
              />
              {!fields.slug && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="日時から作る"
                  aria-label="URL を日時から作る"
                  onClick={fillSlugFromDate}
                >
                  <Wand2 />
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="excerpt">概要（一覧・検索結果・SNS に表示）</Label>
            <Textarea
              id="excerpt"
              value={fields.excerpt}
              onChange={(e) => set('excerpt', e.target.value)}
              maxLength={300}
              rows={3}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>本文</Label>
        <RichTextEditor
          key={editorKey}
          value={fields.content}
          onChange={(content) => set('content', content)}
        />
      </div>

      <FormError message={error} />

      {/* 下に固定する操作バー。長い記事でもすぐ保存できる */}
      <StickyActionBar>
        {isPublished ? (
          <>
            <Button
              type="button"
              disabled={saving}
              onClick={() => submit('published')}
            >
              更新する
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => submit('draft')}
            >
              非公開に戻す
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              disabled={saving}
              onClick={() => submit('published')}
            >
              公開する
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => submit('draft')}
            >
              下書き保存
            </Button>
          </>
        )}

        <SaveStatus
          dirty={dirty}
          saving={saving}
          savedAt={savedAt}
          autoSaving={autoSaving}
        />
        <span className="hidden text-xs text-muted-foreground lg:inline">
          Ctrl+S で保存{canAutosave ? '・下書きは自動保存' : ''}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <PreviewButton
            content={fields.content}
            header={
              <header className="border-b pb-6">
                <h1 className="text-3xl font-bold leading-tight">
                  {fields.title || '（タイトルなし）'}
                </h1>
                {fields.excerpt && (
                  <p className="mt-3 text-lg text-muted-foreground">
                    {fields.excerpt}
                  </p>
                )}
              </header>
            }
          />
          {isPublished && post && (
            <PublicPageLink to="/blog/$slug" slug={post.slug} />
          )}
          {post && <DeleteButton disabled={saving} onClick={onDelete} />}
        </div>
      </StickyActionBar>
    </form>
  )
}
