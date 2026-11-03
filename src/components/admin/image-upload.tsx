import { useServerFn } from '@tanstack/react-start'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { imageUrl } from '@/lib/collections'
import { uploadImage } from '@/server/images'

type Props = {
  value: string | null
  onChange: (key: string | null) => void
  /** R2 内の保存先フォルダ（半角英小文字とハイフン） */
  folder: string
}

/** 画像を 1 枚選んで R2 にアップロードする。保存ボタンを押すまで記事には反映されない */
export function ImageUpload({ value, onChange, folder }: Props) {
  const upload = useServerFn(uploadImage)
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setPending(true)
    setError(null)
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('folder', folder)
      const { key } = await upload({ data: form })
      onChange(key)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'アップロードできませんでした')
    } finally {
      setPending(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const src = imageUrl(value)

  return (
    <div className="space-y-2">
      <div className="relative flex aspect-square w-full max-w-64 items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/30">
        {src ? (
          <img src={src} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus className="size-8 text-muted-foreground" />
        )}
        {pending && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-6 animate-spin" />
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {src ? '画像を変更' : '画像を選ぶ'}
        </Button>
        {src && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => onChange(null)}
          >
            <X />
            外す
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        JPEG / PNG / WebP / GIF / AVIF、10MB まで
      </p>
    </div>
  )
}
