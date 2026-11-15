import { Link, useMatchRoute, useSearch } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import {
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useSiteIndex } from '@/hooks/use-site-index'
import {
  type AttributeField,
  type CollectionKind,
  collectionList,
  filterKeysOf,
} from '@/lib/collections/config'
import { playgroundCategories, playgroundTools } from '@/lib/playground/tools'

/**
 * サイドバーで、今いる場所（第一階層）の下に出す中身。
 * プレイグラウンドは道具の一覧、ブログは最近の記事、コレクションは絞り込みの項目（分類・状態など）の値
 */
export function SectionContents({
  path,
  onNavigate,
}: {
  path: string
  onNavigate: () => void
}) {
  const { open, openMobile, isMobile } = useSidebar()
  const visible = isMobile ? openMobile : open
  const ref = useRef<HTMLUListElement>(null)

  // 開いたときに、今いるページの行が見えるようにする（道具が多いので）
  useEffect(() => {
    if (!visible) return
    const id = window.setTimeout(() => {
      ref.current
        ?.querySelector('[data-active=true]')
        ?.scrollIntoView({ block: 'nearest' })
    }, 300)
    return () => window.clearTimeout(id)
  }, [visible])

  if (path === '/playground') {
    return (
      <SidebarMenuSub ref={ref}>
        <PlaygroundTools onNavigate={onNavigate} />
      </SidebarMenuSub>
    )
  }
  if (path === '/blog') {
    return (
      <SidebarMenuSub ref={ref}>
        <RecentPosts enabled={visible} onNavigate={onNavigate} />
      </SidebarMenuSub>
    )
  }
  const config = collectionList.find((c) => c.path === path)
  if (!config) return null
  return (
    <SidebarMenuSub ref={ref}>
      <CollectionFacet
        kind={config.kind}
        enabled={visible}
        onNavigate={onNavigate}
      />
    </SidebarMenuSub>
  )
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <li className="px-2 pt-2 pb-0.5 text-[11px] font-medium text-muted-foreground first:pt-1">
      {children}
    </li>
  )
}

/** プレイグラウンドの道具（カテゴリごと） */
function PlaygroundTools({ onNavigate }: { onNavigate: () => void }) {
  const matchRoute = useMatchRoute()
  return playgroundCategories.map((category) => (
    <SubGroup key={category} label={category}>
      {playgroundTools
        .filter((t) => t.category === category)
        .map((tool) => (
          <SidebarMenuSubItem key={tool.slug}>
            <SidebarMenuSubButton
              asChild
              size="sm"
              isActive={Boolean(
                matchRoute({
                  to: '/playground/$slug',
                  params: { slug: tool.slug },
                }),
              )}
            >
              <Link
                to="/playground/$slug"
                params={{ slug: tool.slug }}
                onClick={onNavigate}
              >
                <span>{tool.name}</span>
              </Link>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        ))}
    </SubGroup>
  ))
}

function SubGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <>
      <SubLabel>{label}</SubLabel>
      {children}
    </>
  )
}

const RECENT_POSTS = 5

/** ブログの最近の記事 */
function RecentPosts({
  enabled,
  onNavigate,
}: {
  enabled: boolean
  onNavigate: () => void
}) {
  const matchRoute = useMatchRoute()
  const { index } = useSiteIndex(enabled)
  const posts = index?.posts.slice(0, RECENT_POSTS) ?? []
  if (posts.length === 0) return null

  return (
    <>
      <SubLabel>最近の記事</SubLabel>
      {posts.map((post) => (
        <SidebarMenuSubItem key={post.slug}>
          <SidebarMenuSubButton
            asChild
            size="sm"
            isActive={Boolean(
              matchRoute({ to: '/blog/$slug', params: { slug: post.slug } }),
            )}
          >
            <Link
              to="/blog/$slug"
              params={{ slug: post.slug }}
              onClick={onNavigate}
            >
              <span>{post.title}</span>
            </Link>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      ))}
    </>
  )
}

/** 項目に入っている値と数（選択肢は選択肢の順、文字は多い順に MAX_VALUES 個まで） */
function valueCounts(
  field: AttributeField,
  items: readonly { attributes: Record<string, string> }[],
) {
  const counts = new Map<string, number>()
  for (const item of items) {
    const value = item.attributes[field.key]
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  if (field.type === 'select') {
    return field.options
      .map((o) => ({ ...o, count: counts.get(o.value) ?? 0 }))
      .filter((o) => o.count > 0)
  }
  return [...counts]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_VALUES)
}

const MAX_VALUES = 6

/**
 * コレクションの絞り込みの項目の値と数（本なら読書状況や分類）。押すとその値で絞った一覧を開く。
 * 絞り込みの項目のうち、値が 2 つ以上あって選ぶ意味のある最初のものを出す
 */
function CollectionFacet({
  kind,
  enabled,
  onNavigate,
}: {
  kind: CollectionKind
  enabled: boolean
  onNavigate: () => void
}) {
  const matchRoute = useMatchRoute()
  const search = useSearch({ strict: false }) as Record<string, unknown>
  const { index } = useSiteIndex(enabled)
  const config = collectionList.find((c) => c.kind === kind)
  if (!index || !config) return null

  const items = index.items.filter((item) => item.kind === kind)
  const fields: readonly AttributeField[] = config.fields
  const facet = filterKeysOf(kind)
    .map((key) => fields.find((f) => f.key === key))
    .filter((f): f is AttributeField => f !== undefined)
    .map((field) => ({ field, options: valueCounts(field, items) }))
    .find((f) => f.options.length >= 2)
  if (!facet) return null
  const { field, options } = facet
  const onList = Boolean(matchRoute({ to: config.path }))

  return (
    <>
      <SubLabel>{field.label}</SubLabel>
      {options.map((o) => (
        <SidebarMenuSubItem key={o.value}>
          <SidebarMenuSubButton
            asChild
            size="sm"
            isActive={onList && search[field.key] === o.value}
          >
            <Link
              to={config.path}
              search={{ [field.key]: o.value } as never}
              onClick={onNavigate}
            >
              <span>{o.label}</span>
              <span className="ml-auto text-muted-foreground tabular-nums">
                {o.count}
              </span>
            </Link>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      ))}
    </>
  )
}
