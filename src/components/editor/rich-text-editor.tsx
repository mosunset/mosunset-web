import { Placeholder } from '@tiptap/extensions'
import {
  type Editor,
  EditorContent,
  useEditor,
  useEditorState,
} from '@tiptap/react'
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo,
  SquareCode,
  Strikethrough,
  Undo,
} from 'lucide-react'
import type * as React from 'react'

import { Separator } from '@/components/ui/separator'
import { type RichTextDoc, richTextExtensions } from '@/lib/tiptap'
import { cn } from '@/lib/utils'

type Props = {
  value: RichTextDoc
  onChange: (value: RichTextDoc) => void
  placeholder?: string
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = '本文を書く…',
}: Props) {
  const editor = useEditor({
    extensions: [...richTextExtensions, Placeholder.configure({ placeholder })],
    content: value,
    // SSR ではエディタを描画せず、ブラウザで初期化する
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
    editorProps: {
      attributes: {
        class:
          'prose prose-neutral dark:prose-invert max-w-none min-h-[420px] px-4 py-3 focus:outline-none',
      },
    },
  })

  return (
    <div className="rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring/50">
      {editor ? <Toolbar editor={editor} /> : <div className="h-11 border-b" />}
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
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

  const setLink = () => {
    const current = editor.getAttributes('link').href as string | undefined
    const href = window.prompt(
      'リンク先の URL（空にすると解除）',
      current ?? '',
    )
    if (href === null) return
    if (href === '') {
      chain().extendMarkRange('link').unsetLink().run()
      return
    }
    chain().extendMarkRange('link').setLink({ href }).run()
  }

  return (
    <div className="sticky top-(--header-height) z-10 flex flex-wrap items-center gap-0.5 border-b bg-background/95 p-1.5 backdrop-blur">
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
        label="インラインコード"
        active={state.code}
        onClick={() => chain().toggleCode().run()}
      >
        <Code />
      </ToolButton>
      <ToolButton label="リンク" active={state.link} onClick={setLink}>
        <LinkIcon />
      </ToolButton>

      <Separator orientation="vertical" className="mx-1 h-5!" />

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

      <Separator orientation="vertical" className="mx-1 h-5!" />

      <ToolButton
        label="元に戻す"
        disabled={!state.canUndo}
        onClick={() => chain().undo().run()}
      >
        <Undo />
      </ToolButton>
      <ToolButton
        label="やり直す"
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
      onClick={onClick}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4',
        active && 'bg-muted text-foreground',
      )}
    >
      {children}
    </button>
  )
}
