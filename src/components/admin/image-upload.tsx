import { useServerFn } from '@tanstack/react-start'
import { Camera, ImagePlus, Loader2, X } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { imageUrl } from '@/lib/collections'
import { errorMessage } from '@/lib/errors'
import { imageFilesFrom, resizeImage } from '@/lib/image-resize'
import { cn } from '@/lib/utils'
import { uploadImage } from '@/server/images'

type Props = {
  value: string | null
  onChange: (key: string | null) => void
  /** R2 内の保存先フォルダ（半角英小文字とハイフン） */
  folder: string
}

/**
 * 画像を 1 枚選んで R2 にアップロードする。
 * クリック・ドラッグ＆ドロップ・貼り付け（Ctrl+V）・スマホのカメラに対応し、送る前に縮小する。
 * 保存ボタンを押すまでアイテムには反映されない。
 */
export function ImageUpload({ value, onChange, folder }: Props) {
  const upload = useServerFn(uploadImage)
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setPending(true)
    setError(null)
    try {
      const resized = await resizeImage(file)
      const form = new FormData()
      form.set('file', resized)
      form.set('folder', folder)
      const { key } = await upload({ data: form })
      onChange(key)
    } catch (e) {
      setError(errorMessage(e, 'アップロードできませんでした'))
    } finally {
      setPending(false)
    }
  }

  const src = imageUrl(value)

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onPaste={(e) => {
          const [file] = imageFilesFrom(e.clipboardData)
          if (file) {
            e.preventDefault()
            onFile(file)
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          onFile(imageFilesFrom(e.dataTransfer)[0])
        }}
        aria-label={src ? '画像を変更' : '画像を選ぶ'}
        className={cn(
          'group relative flex aspect-square w-full max-w-64 items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/30 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
          dragging && 'border-primary bg-primary/5',
        )}
      >
        {src ? (
          <>
            <img src={src} alt="" className="size-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-background/80 py-1.5 text-center text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              クリック・ドロップで変更
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-2 px-4 text-center text-sm text-muted-foreground">
            <ImagePlus className="size-8" />
            クリック・ドロップ・貼り付けで画像を追加
          </span>
        )}
        {pending && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-6 animate-spin" />
          </span>
        )}
      </button>

      <div className="flex flex-wrap gap-2">
        {/* スマホではカメラで撮ってそのまま登録できる */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="sm:hidden"
          disabled={pending}
          onClick={() => cameraRef.current?.click()}
        >
          <Camera />
          撮影する
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
        onChange={(e) => {
          onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        大きな写真は自動で縮小します（10MB まで）
      </p>
    </div>
  )
}
