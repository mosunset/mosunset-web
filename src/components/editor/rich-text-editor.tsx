import { useServerFn } from '@tanstack/react-start'
import { Placeholder } from '@tiptap/extensions'
import {
  type Editor,
  EditorContent,
  useEditor,
  useEditorState,
} from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Quote,
  Redo,
  SquareCode,
  Strikethrough,
  Undo,
} from 'lucide-react'
import type * as React from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { LinkDialog } from '@/components/editor/link-dialog'
import {
  createSlashCommand,
  slashItems,
} from '@/components/editor/slash-command'
import { Separator } from '@/components/ui/separator'
import { errorMessage } from '@/lib/errors'
import { imageFilesFrom, resizeImage } from '@/lib/image-resize'
import { type RichTextDoc, richTextExtensions } from '@/lib/tiptap'
import { cn } from '@/lib/utils'
import { uploadImage } from '@/server/images'

type Props = {
  value: RichTextDoc
  onChange: (value: RichTextDoc) => void
  placeholder?: string
  /** 本文に入れた画像の保存先（R2 のフォルダ） */
  imageFolder?: string
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = '本文を書く…（「/」でメニュー）',
  imageFolder = 'posts',
}: Props) {
  const upload = useServerFn(uploadImage)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [uploading, setUploading] = useState(0)

  // エディタの設定は最初に一度だけ作るので、変わる値は ref で渡す
  const editorRef = useRef<Editor | null>(null)
  const uploadRef = useRef<(files: File[], pos?: number) => void>(() => {})

  uploadRef.current = async (files: File[], pos?: number) => {
    const editor = editorRef.current
    if (!editor || files.length === 0) return
    setUploading((n) => n + files.length)
    for (const file of files) {
      try {
        const resized = await resizeImage(file)
        const form = new FormData()
        form.set('file', resized)
        form.set('folder', imageFolder)
        const { key } = await upload({ data: form })
        const node = {
          type: 'image',
          attrs: { src: `/images/${key}`, alt: '' },
        }
        if (pos !== undefined) {
          editor.chain().focus().insertContentAt(pos, node).run()
        } else {
          editor.chain().focus().insertContent(node).run()
        }
      } catch (e) {
        toast.error(
          `画像をアップロードできませんでした: ${errorMessage(e, '')}`,
        )
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  const pickImage = useCallback(() => fileInputRef.current?.click(), [])

  const extensions = useMemo(
    () => [
      ...richTextExtensions,
      Placeholder.configure({ placeholder }),
      createSlashCommand(() => slashItems(pickImage)),
    ],
    [placeholder, pickImage],
  )

  const editor = useEditor({
    extensions,
    content: value,
    // SSR ではエディタを描画せず、ブラウザで初期化する
    immediatelyRender: false,
    onCreate: ({ editor }) => {
      editorRef.current = editor
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
    editorProps: {
      attributes: {
        class:
          'prose prose-neutral dark:prose-invert max-w-none min-h-[420px] px-4 py-3 focus:outline-none [&_img]:rounded-md [&_img.ProseMirror-selectednode]:ring-2 [&_img.ProseMirror-selectednode]:ring-ring',
      },
      handlePaste: (_view, event) => {
        const files = imageFilesFrom(event.clipboardData)
        if (files.length === 0) return false
        event.preventDefault()
        uploadRef.current(files)
        return true
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false
        const files = imageFilesFrom(event.dataTransfer)
        if (files.length === 0) return false
        event.preventDefault()
        const pos = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        })
        uploadRef.current(files, pos?.pos)
        return true
      },
      handleKeyDown: (_view, event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === 'k'
        ) {
          event.preventDefault()
          setLinkOpen(true)
          return true
        }
        return false
      },
    },
  })

  return (
    <div className="relative rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring/50">
      {editor ? (
        <>
          <Toolbar
            editor={editor}
            onLink={() => setLinkOpen(true)}
            onImage={pickImage}
          />
          <SelectionMenu editor={editor} onLink={() => setLinkOpen(true)} />
          <LinkDialog
            editor={editor}
            open={linkOpen}
            onOpenChange={setLinkOpen}
          />
        </>
      ) : (
        <div className="h-11 border-b" />
      )}
      <EditorContent editor={editor} />

      {uploading > 0 && (
        <div className="absolute right-3 bottom-3 flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm shadow-sm">
          <Loader2 className="size-4 animate-spin" />
          画像をアップロード中（{uploading}）
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        multiple
        className="hidden"
        onChange={(e) => {
          uploadRef.current(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** 文字を選んだときに出るツールバー */
function SelectionMenu({
  editor,
  onLink,
}: {
  editor: Editor
  onLink: () => void
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
    }),
  })
  const chain = () => editor.chain().focus()

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: e, state: s }) =>
        !s.selection.empty && !e.isActive('image') && !e.isActive('codeBlock')
      }
      className="flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-md"
    >
      <ToolButton
        label="太字"
        active={state.bold}
        onClick={() => chain().toggleBold().run()}
      >
        <Bold />
      </ToolButton>
      <ToolButton
        label="斜体"
        active={state.italic}
        onClick={() => chain().toggleItalic().run()}
      >
        <Italic />
      </ToolButton>
      <ToolButton
        label="取り消し線"
        active={state.strike}
        onClick={() => chain().toggleStrike().run()}
      >
        <Strikethrough />
      </ToolButton>
      <ToolButton
        label="コード"
        active={state.code}
        onClick={() => chain().toggleCode().run()}
      >
        <Code />
      </ToolButton>
      <ToolButton label="リンク（Ctrl+K）" active={state.link} onClick={onLink}>
        <LinkIcon />
      </ToolButton>
      <Separator orientation="vertical" className="mx-0.5 h-5!" />
      <ToolButton
        label="見出し 2"
        active={state.h2}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 />
      </ToolButton>
      <ToolButton
        label="見出し 3"
        active={state.h3}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 />
      </ToolButton>
    </BubbleMenu>
  )
}

function Toolbar({
  editor,
  onLink,
  onImage,
}: {
  editor: Editor
  onLink: () => void
  onImage: () => void
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      blockquote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
      link: e.isActive('link'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })

  const chain = () => editor.chain().focus()

  return (
    // スマホでは横にスクロールできる 1 行にする
    <div className="sticky top-(--header-height) z-10 flex items-center gap-0.5 overflow-x-auto border-b bg-background/95 p-1.5 backdrop-blur [scrollbar-width:none] sm:flex-wrap">
      <ToolButton
        label="太字（Ctrl+B）"
        active={state.bold}
        onClick={() => chain().toggleBold().run()}
      >
        <Bold />
      </ToolButton>
      <ToolButton
        label="斜体（Ctrl+I）"
        active={state.italic}
        onClick={() => chain().toggleItalic().run()}
      >
        <Italic />
      </ToolButton>
      <ToolButton
        label="取り消し線"
        active={state.strike}
        onClick={() => chain().toggleStrike().run()}
      >
        <Strikethrough />
      </ToolButton>
      <ToolButton
        label="インラインコード"
        active={state.code}
        onClick={() => chain().toggleCode().run()}
      >
        <Code />
      </ToolButton>
      <ToolButton label="リンク（Ctrl+K）" active={state.link} onClick={onLink}>
        <LinkIcon />
      </ToolButton>

      <Separator orientation="vertical" className="mx-1 h-5! shrink-0" />

      <ToolButton
        label="見出し 2"
        active={state.h2}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 />
      </ToolButton>
      <ToolButton
        label="見出し 3"
        active={state.h3}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 />
      </ToolButton>
      <ToolButton
        label="箇条書き"
        active={state.bulletList}
        onClick={() => chain().toggleBulletList().run()}
      >
        <List />
      </ToolButton>
      <ToolButton
        label="番号付きリスト"
        active={state.orderedList}
        onClick={() => chain().toggleOrderedList().run()}
      >
        <ListOrdered />
      </ToolButton>
      <ToolButton
        label="引用"
        active={state.blockquote}
        onClick={() => chain().toggleBlockquote().run()}
      >
        <Quote />
      </ToolButton>
      <ToolButton
        label="コードブロック"
        active={state.codeBlock}
        onClick={() => chain().toggleCodeBlock().run()}
      >
        <SquareCode />
      </ToolButton>
      <ToolButton
        label="区切り線"
        onClick={() => chain().setHorizontalRule().run()}
      >
        <Minus />
      </ToolButton>
      <ToolButton
        label="画像（貼り付け・ドロップでも入れられます）"
        onClick={onImage}
      >
        <ImagePlus />
      </ToolButton>

      <Separator orientation="vertical" className="mx-1 h-5! shrink-0" />

      <ToolButton
        label="元に戻す（Ctrl+Z）"
        disabled={!state.canUndo}
        onClick={() => chain().undo().run()}
      >
        <Undo />
      </ToolButton>
      <ToolButton
        label="やり直す（Ctrl+Shift+Z）"
        disabled={!state.canRedo}
        onClick={() => chain().redo().run()}
      >
        <Redo />
      </ToolButton>
    </div>
  )
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // クリックでエディタの選択が外れないようにする
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 sm:size-8 [&_svg]:size-4',
        active && 'bg-muted text-foreground',
      )}
    >
      {children}
    </button>
  )
}
