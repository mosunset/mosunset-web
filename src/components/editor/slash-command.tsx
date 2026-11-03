import {
  type Editor,
  Extension,
  type Range,
  ReactRenderer,
} from '@tiptap/react'
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from '@tiptap/suggestion'
import {
  Code2,
  Heading2,
  Heading3,
  Heading4,
  ImagePlus,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
} from 'lucide-react'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

import { cn } from '@/lib/utils'

export type SlashItem = {
  title: string
  /** 検索に使う別名（ローマ字・英語など） */
  keywords: string[]
  icon: React.ComponentType<{ className?: string }>
  run: (editor: Editor, range: Range) => void
}

/** 画像の挿入はエディタ側でファイル選択を開くので、呼び出し元から渡す */
export function slashItems(onPickImage: () => void): SlashItem[] {
  return [
    {
      title: '本文',
      keywords: ['text', 'paragraph', 'p', 'honbun'],
      icon: Pilcrow,
      run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run(),
    },
    {
      title: '見出し 2',
      keywords: ['h2', 'heading', 'midashi'],
      icon: Heading2,
      run: (e, r) =>
        e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run(),
    },
    {
      title: '見出し 3',
      keywords: ['h3', 'heading', 'midashi'],
      icon: Heading3,
      run: (e, r) =>
        e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run(),
    },
    {
      title: '見出し 4',
      keywords: ['h4', 'heading', 'midashi'],
      icon: Heading4,
      run: (e, r) =>
        e.chain().focus().deleteRange(r).setHeading({ level: 4 }).run(),
    },
    {
      title: '箇条書き',
      keywords: ['ul', 'list', 'bullet', 'kajogaki'],
      icon: List,
      run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
    },
    {
      title: '番号付きリスト',
      keywords: ['ol', 'list', 'number', 'bango'],
      icon: ListOrdered,
      run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
    },
    {
      title: '引用',
      keywords: ['quote', 'blockquote', 'inyo'],
      icon: Quote,
      run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run(),
    },
    {
      title: 'コードブロック',
      keywords: ['code', 'pre', 'kodo'],
      icon: Code2,
      run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run(),
    },
    {
      title: '区切り線',
      keywords: ['hr', 'divider', 'line', 'kugiri'],
      icon: Minus,
      run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
    },
    {
      title: '画像',
      keywords: ['image', 'img', 'picture', 'gazo', 'shashin'],
      icon: ImagePlus,
      run: (e, r) => {
        e.chain().focus().deleteRange(r).run()
        onPickImage()
      },
    },
  ]
}

function filterItems(items: SlashItem[], query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.keywords.some((k) => k.startsWith(q)),
  )
}

type ListHandle = { onKeyDown: (props: SuggestionKeyDownProps) => boolean }

const CommandList = forwardRef<
  ListHandle,
  SuggestionProps<SlashItem, SlashItem>
>(function CommandList({ items, command }, ref) {
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: 候補が変わったら選択を先頭に戻す
  useEffect(() => setSelected(0), [items])
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) return false
      if (event.key === 'ArrowDown') {
        setSelected((i) => (i + 1) % items.length)
        return true
      }
      if (event.key === 'ArrowUp') {
        setSelected((i) => (i - 1 + items.length) % items.length)
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = items[selected]
        if (item) command(item)
        return true
      }
      return false
    },
  }))

  return (
    <div
      ref={listRef}
      className="z-50 max-h-80 w-60 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {items.length === 0 ? (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">
          見つかりません
        </p>
      ) : (
        items.map((item, i) => (
          <button
            key={item.title}
            type="button"
            data-index={i}
            onMouseEnter={() => setSelected(i)}
            onMouseDown={(e) => {
              // エディタのフォーカスを外さない
              e.preventDefault()
              command(item)
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
              i === selected && 'bg-accent text-accent-foreground',
            )}
          >
            <item.icon className="size-4 text-muted-foreground" />
            {item.title}
          </button>
        ))
      )}
    </div>
  )
})

/** 行頭で「/」を打つと、見出しやリストを選べるメニューを出す */
export function createSlashCommand(getItems: () => SlashItem[]) {
  return Extension.create({
    name: 'slashCommand',
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          char: '/',
          startOfLine: true,
          items: ({ query }) => filterItems(getItems(), query),
          command: ({ editor, range, props }) => props.run(editor, range),
          render: () => {
            let component: ReactRenderer<ListHandle> | null = null
            let unmount: (() => void) | undefined
            return {
              onStart: (props) => {
                component = new ReactRenderer(CommandList, {
                  props,
                  editor: props.editor,
                })
                unmount = props.mount(component.element as HTMLElement)
              },
              onUpdate: (props) => component?.updateProps(props),
              onKeyDown: (props) => {
                if (props.event.key === 'Escape') {
                  unmount?.()
                  return true
                }
                return component?.ref?.onKeyDown(props) ?? false
              },
              onExit: () => {
                unmount?.()
                component?.destroy()
                component = null
              },
            }
          },
        }),
      ]
    },
  })
}
