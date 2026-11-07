import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'

import { AttributeInput } from '@/components/admin/attribute-input'
import {
  DeleteButton,
  FormError,
  PublicPageLink,
  StickyActionBar,
} from '@/components/admin/form-parts'
import { ImageUpload } from '@/components/admin/image-upload'
import {
  IsbnInput,
  type IsbnResult,
  mergeIsbnResult,
} from '@/components/admin/isbn-lookup'
import { PreviewButton } from '@/components/admin/preview-dialog'
import { FormRecovery, SaveStatus } from '@/components/admin/unsaved-changes'
import { RichTextEditor } from '@/components/editor/rich-text-editor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deleteItem, saveItem } from '@/functions/collections'
import { useEditableForm } from '@/hooks/use-editable-form'
import { useSaveShortcut } from '@/hooks/use-save-shortcut'
import {
  type CollectionAttributes,
  type CollectionKind,
  collections,
} from '@/lib/collections'
import { imageUrl } from '@/lib/images'
import { slugInputPattern } from '@/lib/slug'
import { emptyDoc, type RichTextDoc } from '@/lib/tiptap'

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

type CollectionFields = {
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
  const {
    fields,
    setFields,
    set,
    dirty,
    editorKey,
    saving,
    savedAt,
    error,
    runSave,
    runDelete,
    recovery,
  } = useEditableForm({
    initial,
    backupKey: `collection:${kind}:${item?.id ?? 'new'}`,
    savedAt: item ? item.updatedAt : null,
  })

  const setAttribute = (key: string, value: string) =>
    setFields((prev) => ({
      ...prev,
      attributes: { ...prev.attributes, [key]: value },
    }))

  /** ISBN の検索結果を、空いている項目にだけ入れる */
  const applyIsbnResult = (result: IsbnResult) => {
    const { fields: next, filled } = mergeIsbnResult(fields, result)
    setFields(next)

    if (filled.length > 0) {
      toast.success(`「${result.title}」の${filled.join('・')}を入れました`)
    } else {
      toast.info(
        `「${result.title}」が見つかりました（入力済みの項目はそのままです）`,
      )
    }
    if (!fields.imageKey && !result.imageKey) {
      toast.info('表紙は見つかりませんでした。写真の欄から追加できます')
    }
  }

  const submit = useCallback(
    (): Promise<boolean> =>
      runSave(
        (fields) =>
          save({
            data: {
              id: item?.id,
              kind,
              ...fields,
              // 並び順は一覧のドラッグで変えるので、ここでは今の値を保つ
              sortOrder: item?.sortOrder ?? 0,
            },
          }),
        {
          onSaved: async (result) => {
            toast.success(
              item ? '保存しました' : `${config.label}を追加しました`,
            )
            if (!item) {
              await router.navigate({
                to: '/admin/collections/$kind/$id',
                params: { kind, id: result.id },
                replace: true,
              })
            } else {
              await router.invalidate()
            }
          },
        },
      ),
    [runSave, item, kind, save, router, config.label],
  )

  useSaveShortcut(() => {
    submit()
  })

  const onDelete = () => {
    if (!item) return
    return runDelete({
      title: item.title,
      remove: () => remove({ data: { id: item.id } }),
      onDeleted: async () => {
        await router.navigate({
          to: '/admin/collections/$kind',
          params: { kind },
        })
      },
    })
  }

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <FormRecovery {...recovery} onSave={submit} />

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
            {config.fields.map((field) =>
              kind === 'book' && field.key === 'isbn' ? (
                <IsbnInput
                  key={field.key}
                  value={fields.attributes.isbn ?? ''}
                  onChange={(value) => setAttribute('isbn', value)}
                  needCover={!fields.imageKey}
                  onFound={applyIsbnResult}
                />
              ) : (
                <AttributeInput
                  key={field.key}
                  field={field}
                  value={fields.attributes[field.key] ?? ''}
                  onChange={(value) => setAttribute(field.key, value)}
                />
              ),
            )}
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
              pattern={slugInputPattern}
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

      <FormError message={error} />

      <StickyActionBar>
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
            <PublicPageLink to={config.detailPath} slug={item.slug} />
          )}
          {item && <DeleteButton disabled={saving} onClick={onDelete} />}
        </div>
      </StickyActionBar>
    </form>
  )
}
