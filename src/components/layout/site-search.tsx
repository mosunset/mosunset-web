import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, Search } from 'lucide-react'
import {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'

import { DraftBadge } from '@/components/common/draft-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSiteIndex } from '@/hooks/use-site-index'
import { mainNav } from '@/lib/navigation'
import {
  buildEntries,
  pageEntries,
  type SearchEntry,
  type SearchResultGroup,
  searchSite,
} from '@/lib/site-search'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// 開いているかどうか（ヘッダーのボタン・サイドバー・Ctrl+K のどこからでも開けるように、1 か所に置く）
// ---------------------------------------------------------------------------

let isOpen = false
const listeners = new Set<() => void>()

export function setSiteSearchOpen(open: boolean) {
  isOpen = open
  for (const listener of listeners) listener()
}

function useSiteSearchOpen() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => isOpen,
    () => false,
  )
}

/** Mac では ⌘K、ほかは Ctrl K と書く（サーバーでは分からないので Ctrl K） */
function useShortcutLabel() {
  return useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K'),
    () => 'Ctrl K',
  )
}

// ---------------------------------------------------------------------------
// ヘッダーのボタン
// ---------------------------------------------------------------------------

/** 広い画面用。「検索」と近道のキーを書いたボタン */
export function SiteSearchButton({ className }: { className?: string }) {
  const shortcut = useShortcutLabel()
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setSiteSearchOpen(true)}
      className={cn(
        'w-36 justify-start gap-2 bg-muted/40 font-normal text-muted-foreground shadow-none',
        className,
      )}
    >
      <Search />
      検索
      <kbd className="ml-auto rounded border bg-background px-1.5 font-sans text-[10px] font-medium">
        {shortcut}
      </kbd>
    </Button>
  )
}

/** 狭い画面用。虫眼鏡だけのボタン */
export function SiteSearchIconButton({ className }: { className?: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="サイト内を検索"
      onClick={() => setSiteSearchOpen(true)}
      className={className}
    >
      <Search />
    </Button>
  )
}

// ---------------------------------------------------------------------------
// 検索の画面
// ---------------------------------------------------------------------------

/**
 * サイト全体の検索。Ctrl+K（⌘K）でも開く。公開側のレイアウトに 1 つだけ置く
 */
export function SiteSearchDialog() {
  const open = useSiteSearchOpen()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === 'k' &&
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey &&
        !e.defaultPrevented
      ) {
        e.preventDefault()
        setSiteSearchOpen(!isOpen)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setSiteSearchOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-3 flex max-h-[calc(100svh-1.5rem)] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:top-[12vh] sm:max-h-[76vh] sm:max-w-xl"
      >
        <DialogTitle className="sr-only">サイト内を検索</DialogTitle>
        <DialogDescription className="sr-only">
          記事・プレイグラウンドの道具・コレクションをまとめて探せます。上下のキーで選び、Enter
          で開きます。
        </DialogDescription>
        {/* 開くたびに打った言葉を空にする */}
        {open && <SearchPanel onClose={() => setSiteSearchOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

/** 選べる行（見つかったもの 1 件、または「すべて見る」） */
type Option =
  | { type: 'entry'; entry: SearchEntry }
  | { type: 'more'; group: SearchResultGroup; to: string; q: string }

const groupIcons = new Map<string, (typeof mainNav)[number]['icon']>(
  mainNav.map((n) => [n.title, n.icon]),
)

function SearchPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const { index, failed } = useSiteIndex(true)
  const entries = useMemo(() => buildEntries(index), [index])
  const searching = query.trim() !== ''

  const groups: SearchResultGroup[] = useMemo(
    () =>
      searching
        ? searchSite(entries, query)
        : [
            {
              label: 'ページ',
              listPath: null,
              total: pageEntries.length,
              entries: [...pageEntries],
            },
          ],
    [entries, query, searching],
  )

  // 行の並び（上下のキーで動く順）。まとまりの最後に「すべて見る」を挟む
  const sections = groups.map((group) => {
    const options: Option[] = group.entries.map((entry) => ({
      type: 'entry',
      entry,
    }))
    if (group.listPath && group.total > group.entries.length) {
      options.push({
        type: 'more',
        group,
        to: group.listPath,
        q: query.trim(),
      })
    }
    return { group, options }
  })
  const options = sections.flatMap((s) => s.options)
  // まとまりごとの、最初の行の番号
  const starts = sections.map((_, i) =>
    sections.slice(0, i).reduce((sum, s) => sum + s.options.length, 0),
  )
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0))
  const optionId = (i: number) => `${listId}-option-${i}`

  // 選んでいる行が見えるように、リストをスクロールする
  useEffect(() => {
    document
      .getElementById(`${listId}-option-${activeIndex}`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, listId])

  const open = (option: Option) => {
    onClose()
    if (option.type === 'entry') navigate({ href: option.entry.href })
    else navigate({ to: option.to, search: { q: option.q } as never })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 変換中の Enter や矢印は、変換のほうに任せる
    if (e.nativeEvent.isComposing || options.length === 0) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((activeIndex + step + options.length) % options.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      open(options[activeIndex])
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b px-4">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          // biome-ignore lint/a11y/noAutofocus: 開いたらすぐ打てるように
          autoFocus
          type="search"
          role="combobox"
          aria-label="サイト内を検索"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={
            options.length > 0 ? optionId(activeIndex) : undefined
          }
          autoComplete="off"
          enterKeyHint="go"
          placeholder="記事・道具・コレクションを探す"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm [&::-webkit-search-cancel-button]:hidden"
        />
        <kbd className="hidden rounded border px-1.5 text-[10px] text-muted-foreground sm:block">
          Esc
        </kbd>
      </div>

      <div
        id={listId}
        role="listbox"
        aria-label="見つかったもの"
        className="min-h-0 flex-1 overflow-y-auto p-2"
      >
        {sections.map(({ group, options: rows }, s) => (
          // biome-ignore lint/a11y/useSemanticElements: listbox の中のまとまりなので fieldset ではなく group
          <div key={group.label} role="group" aria-label={group.label}>
            <div className="flex items-baseline justify-between px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
              <span>{group.label}</span>
              {searching && group.listPath && (
                <span className="tabular-nums">{group.total} 件</span>
              )}
            </div>
            {rows.map((option, j) => {
              const i = starts[s] + j
              return (
                <OptionRow
                  key={
                    option.type === 'entry'
                      ? option.entry.id
                      : `more:${group.label}`
                  }
                  id={optionId(i)}
                  option={option}
                  selected={i === activeIndex}
                  onHover={() => setActive(i)}
                  onClose={onClose}
                />
              )
            })}
          </div>
        ))}

        {searching && options.length === 0 && index && (
          <p className="px-2 py-8 text-center text-muted-foreground">
            「{query.trim()}」に当たるものは見つかりませんでした。
          </p>
        )}
        {searching && !index && !failed && (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            記事とコレクションを読み込んでいます…
          </p>
        )}
        {failed && (
          <p className="px-2 py-3 text-xs text-destructive">
            記事とコレクションを読み込めませんでした（ページと道具だけ探しています）。
          </p>
        )}
      </div>

      <div className="hidden items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground sm:flex">
        <span>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> で選ぶ
        </span>
        <span>
          <Kbd>Enter</Kbd> で開く
        </span>
        <span>
          <Kbd>Esc</Kbd> で閉じる
        </span>
      </div>
    </>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mr-0.5 rounded border bg-muted px-1 font-sans text-[10px]">
      {children}
    </kbd>
  )
}

function OptionRow({
  id,
  option,
  selected,
  onHover,
  onClose,
}: {
  id: string
  option: Option
  selected: boolean
  onHover: () => void
  onClose: () => void
}) {
  const rowClass = cn(
    'flex items-center gap-3 rounded-md px-2 py-1.5 outline-none',
    selected && 'bg-accent text-accent-foreground',
  )

  if (option.type === 'more') {
    return (
      <Link
        id={id}
        role="option"
        aria-selected={selected}
        tabIndex={-1}
        to={option.to}
        search={{ q: option.q } as never}
        onMouseMove={onHover}
        onClick={onClose}
        className={cn(rowClass, 'text-muted-foreground')}
      >
        <span className="flex size-9 shrink-0 items-center justify-center">
          <ArrowRight className="size-4" />
        </span>
        <span className="text-sm">
          {option.group.label}の {option.group.total} 件をすべて見る
        </span>
      </Link>
    )
  }

  const { entry } = option
  const Icon = entry.icon ?? groupIcons.get(entry.group)
  return (
    <Link
      id={id}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      to={entry.href}
      onMouseMove={onHover}
      onClick={onClose}
      className={rowClass}
    >
      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
        {entry.image ? (
          <img
            src={entry.image}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          Icon && <Icon className="size-4" />
        )}
      </span>
      <span className="grid min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{entry.title}</span>
          {entry.draft && <DraftBadge className="shrink-0" />}
        </span>
        {entry.detail && (
          <span className="truncate text-xs text-muted-foreground">
            {entry.detail}
          </span>
        )}
      </span>
    </Link>
  )
}
