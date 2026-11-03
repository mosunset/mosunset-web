import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { ExternalLink, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { ImageUpload } from '@/components/admin/image-upload'
import { RichTextEditor } from '@/components/editor/rich-text-editor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  type AttributeField,
  type CollectionAttributes,
  type CollectionKind,
  collections,
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
  }
}

export function CollectionForm({ kind, item }: Props) {
  const config = collections[kind]
  const router = useRouter()
  const save = useServerFn(saveItem)
  const remove = useServerFn(deleteItem)

  const [title, setTitle] = useState(item?.title ?? '')
  const [slug, setSlug] = useState(item?.slug ?? '')
  const [acquiredAt, setAcquiredAt] = useState(item?.acquiredAt ?? '')
  const [sortOrder, setSortOrder] = useState(item?.sortOrder ?? 0)
  const [published, setPublished] = useState(item?.published ?? true)
  const [imageKey, setImageKey] = useState(item?.imageKey ?? null)
  const [attributes, setAttributes] = useState<CollectionAttributes>(
    item?.attributes ?? {},
  )
  const [description, setDescription] = useState<RichTextDoc>(
    item?.description ?? emptyDoc,
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const onSubmit = async () => {
    setPending(true)
    setError(null)
    try {
      const result = await save({
        data: {
          id: item?.id,
          kind,
          title,
          slug,
          acquiredAt,
          sortOrder,
          published,
          imageKey,
          attributes,
          description,
        },
      })
      setSavedAt(new Date())
      if (!item) {
        await router.navigate({
          to: '/admin/collections/$kind/$id',
          params: { kind, id: result.id },
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
    if (!item) return
    if (!window.confirm(`「${item.title}」を削除します。元に戻せません。`)) {
      return
    }
    setPending(true)
    try {
      await remove({ data: { id: item.id } })
      await router.navigate({
        to: '/admin/collections/$kind',
        params: { kind },
      })
    } catch (e) {
      setError(errorMessage(e, '削除できませんでした'))
      setPending(false)
    }
  }

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <div className="grid gap-8 md:grid-cols-[16rem_1fr]">
        <ImageUpload
          value={imageKey}
          onChange={setImageKey}
          folder={`collections-${kind}`}
        />

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">名前</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-11 text-lg"
              required
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {config.fields.map((field) => (
              <AttributeInput
                key={field.key}
                field={field}
                value={attributes[field.key] ?? ''}
                onChange={(value) =>
                  setAttributes((prev) => ({ ...prev, [field.key]: value }))
                }
              />
            ))}
            <div className="space-y-2">
              <Label htmlFor="acquiredAt">{config.acquiredAtLabel}</Label>
              <Input
                id="acquiredAt"
                type="date"
                value={acquiredAt}
                onChange={(e) => setAcquiredAt(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>説明・思い出など</Label>
        <RichTextEditor
          value={description}
          onChange={setDescription}
          placeholder="どんなものか、手に入れた経緯など…"
        />
      </div>

      <div className="grid gap-6 rounded-lg border p-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="slug">URL</Label>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span className="shrink-0">{config.path}/</span>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="空なら自動"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              title="半角英小文字・数字・ハイフン"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sortOrder">並び順（小さいほど前）</Label>
          <Input
            id="sortOrder"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
          />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
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

      <div className="flex flex-wrap items-center gap-3 border-t pt-6">
        <Button type="submit" disabled={pending}>
          {item ? '保存する' : '追加する'}
        </Button>
        {savedAt && !pending && (
          <span className="text-sm text-muted-foreground">
            {savedAt.toLocaleTimeString('ja-JP')} に保存しました
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {item?.published && (
            <Button asChild variant="ghost">
              <a
                href={`${config.path}/${item.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink />
                公開ページ
              </a>
            </Button>
          )}
          {item && (
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

      <p className="text-sm text-muted-foreground">
        <Link
          to="/admin/collections/$kind"
          params={{ kind }}
          className="underline"
        >
          {config.label}の一覧に戻る
        </Link>
      </p>
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
