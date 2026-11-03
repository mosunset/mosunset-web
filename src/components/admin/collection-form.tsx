import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ExternalLink, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'

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
import { useLocalBackup } from '@/hooks/use-local-backup'
import { useSaveShortcut } from '@/hooks/use-save-shortcut'
import {
  type AttributeField,
  type CollectionAttributes,
  type CollectionKind,
  collections,
  imageUrl,
} from '@/lib/collections'
import { errorMessage } from '@/lib/errors'
import { emptyDoc, type RichTextDoc } from '@/lib/tiptap'
import { deleteItem, saveItem } from '@/server/collections'

type Props = {
  kind: CollectionKind
  /** 編集時は既存のアイテム。新規作成時は undefined */
  item?: {
    id: string
    title: string
    slug: string
    acquiredAt: string | null
    sortOrder: number
    published: boolean
    imageKey: string | null
    attributes: CollectionAttributes
    description: RichTextDoc | null
    updatedAt: Date
  }
}

export type CollectionFields = {
  title: string
  slug: string
  acquiredAt: string
  published: boolean
  imageKey: string | null
  attributes: CollectionAttributes
  description: RichTextDoc
}

export function CollectionForm({ kind, item }: Props) {
  const config = collections[kind]
  const router = useRouter()
  const save = useServerFn(saveItem)
  const remove = useServerFn(deleteItem)

  const initial = useMemo<CollectionFields>(
    () => ({
      title: item?.title ?? '',
      slug: item?.slug ?? '',
      acquiredAt: item?.acquiredAt ?? '',
      published: item?.published ?? true,
      imageKey: item?.imageKey ?? null,
      attributes: item?.attributes ?? {},
      description: item?.description ?? emptyDoc,
    }),
    [item],
  )
  const [fields, setFields] = useState<CollectionFields>(initial)
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify(initial),
  )
  const [editorKey, setEditorKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(
    item ? item.updatedAt : null,
  )
  const [error, setError] = useState<string | null>(null)

  const dirty = JSON.stringify(fields) !== savedSnapshot
  const {
    backup,
    clear: clearBackup,
    dismiss: dismissBackup,
  } = useLocalBackup(`collection:${kind}:${item?.id ?? 'new'}`, fields, dirty)

  const set = <K extends keyof CollectionFields>(
    key: K,
    value: CollectionFields[K],
  ) => setFields((prev) => ({ ...prev, [key]: value }))
  const setAttribute = (key: string, value: string) =>
    setFields((prev) => ({
      ...prev,
      attributes: { ...prev.attributes, [key]: value },
    }))

  const savingRef = useRef(false)
  const submit = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) return false
    savingRef.current = true
    setSaving(true)
    setError(null)
    const snapshot = JSON.stringify(fields)
    try {
      const result = await save({
        data: {
          id: item?.id,
          kind,
          ...fields,
          // 並び順は一覧のドラッグで変えるので、ここでは今の値を保つ
          sortOrder: item?.sortOrder ?? 0,
        },
      })
      flushSync(() => {
        setSavedSnapshot(snapshot)
        setSavedAt(new Date())
      })
      clearBackup()
      toast.success(item ? '保存しました' : `${config.label}を追加しました`)
      if (!item) {
        await router.navigate({
          to: '/admin/collections/$kind/$id',
          params: { kind, id: result.id },
          replace: true,
        })
      } else {
        await router.invalidate()
      }
      return true
    } catch (e) {
      const message = errorMessage(e)
      setError(message)
      toast.error(message)
      return false
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [fields, item, kind, save, router, clearBackup, config.label])

  useSaveShortcut(() => {
    submit()
  })

  const onDelete = async () => {
    if (!item) return
    if (!window.confirm(`「${item.title}」を削除します。元に戻せません。`)) {
      return
    }
    setSaving(true)
    try {
      await remove({ data: { id: item.id } })
      flushSync(() => setSavedSnapshot(JSON.stringify(fields)))
      clearBackup()
      toast.success('削除しました')
      await router.navigate({
        to: '/admin/collections/$kind',
        params: { kind },
      })
    } catch (e) {
      toast.error(errorMessage(e, '削除できませんでした'))
      setSaving(false)
    }
  }

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <UnsavedChangesGuard dirty={dirty} onSave={submit} />

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

      <div className="grid gap-8 md:grid-cols-[16rem_1fr]">
        <ImageUpload
          value={fields.imageKey}
          onChange={(key) => set('imageKey', key)}
          folder={`collections-${kind}`}
        />

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">名前</Label>
            <Input
              id="title"
              value={fields.title}
              onChange={(e) => set('title', e.target.value)}
              className="h-11 text-lg"
              required
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {config.fields.map((field) => (
              <AttributeInput
                key={field.key}
                field={field}
                value={fields.attributes[field.key] ?? ''}
                onChange={(value) => setAttribute(field.key, value)}
              />
            ))}
            <div className="space-y-2">
              <Label htmlFor="acquiredAt">{config.acquiredAtLabel}</Label>
              <Input
                id="acquiredAt"
                type="date"
                value={fields.acquiredAt}
                onChange={(e) => set('acquiredAt', e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>説明・思い出など</Label>
        <RichTextEditor
          key={editorKey}
          imageFolder={`collections-${kind}`}
          value={fields.description}
          onChange={(value) => set('description', value)}
          placeholder="どんなものか、手に入れた経緯など…"
        />
      </div>

      <div className="grid gap-6 rounded-lg border p-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="slug">URL</Label>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span className="shrink-0">{config.path}/</span>
            <Input
              id="slug"
              value={fields.slug}
              onChange={(e) => set('slug', e.target.value.toLowerCase())}
              placeholder="空なら自動"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              title="半角英小文字・数字・ハイフン"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            checked={fields.published}
            onChange={(e) => set('published', e.target.checked)}
            className="size-4 accent-primary"
          />
          公開ページに表示する
        </label>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button type="submit" disabled={saving}>
          {item ? '保存する' : '追加する'}
        </Button>
        <SaveStatus dirty={dirty} saving={saving} savedAt={savedAt} />
        <span className="hidden text-xs text-muted-foreground lg:inline">
          Ctrl+S で保存
        </span>
        <div className="ml-auto flex items-center gap-1">
          <PreviewButton
            content={fields.description}
            header={
              <div className="flex gap-4">
                {fields.imageKey && (
                  <img
                    src={imageUrl(fields.imageKey) ?? ''}
                    alt=""
                    className="size-32 shrink-0 rounded-lg border object-cover"
                  />
                )}
                <div>
                  <p className="text-sm text-muted-foreground">
                    {config.label}
                  </p>
                  <h1 className="mt-1 text-2xl font-bold">
                    {fields.title || '（名前なし）'}
                  </h1>
                </div>
              </div>
            }
          />
          {item?.published && (
            <Button asChild variant="ghost" size="sm">
              <Link
                to={config.detailPath}
                params={{ slug: item.slug }}
                target="_blank"
              >
                <ExternalLink />
                <span className="hidden sm:inline">公開ページ</span>
              </Link>
            </Button>
          )}
          {item && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={saving}
              onClick={onDelete}
            >
              <Trash2 />
              <span className="hidden sm:inline">削除</span>
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}

function AttributeInput({
  field,
  value,
  onChange,
}: {
  field: AttributeField
  value: string
  onChange: (value: string) => void
}) {
  const id = `attr-${field.key}`

  if (field.type === 'select') {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{field.label}</Label>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{field.label}</Label>
      <Input
        id={id}
        type={field.type === 'text' ? 'text' : field.type}
        value={value}
        placeholder={field.type === 'text' ? field.placeholder : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
