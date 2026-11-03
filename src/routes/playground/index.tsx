import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'

import { SectionPage } from '@/components/section-page'
import { formatDate } from '@/lib/format'
import { getNavItem } from '@/lib/navigation'
import { playgroundCategories, playgroundTools } from '@/lib/playground'
import { seo } from '@/lib/seo'
import { cn } from '@/lib/utils'

const item = getNavItem('/playground')

export const Route = createFileRoute('/playground/')({
  head: () => ({
    meta: seo({ title: item.title, description: item.description }),
  }),
  component: PlaygroundIndex,
})

function PlaygroundIndex() {
  const [category, setCategory] = useState<string | null>(null)
  const tools = playgroundTools.filter(
    (t) => category === null || t.category === category,
  )

  return (
    <SectionPage item={item}>
      <div className="flex flex-wrap gap-2">
        <CategoryChip
          active={category === null}
          onClick={() => setCategory(null)}
        >
          すべて
        </CategoryChip>
        {playgroundCategories.map((c) => (
          <CategoryChip
            key={c}
            active={category === c}
            onClick={() => setCategory(c)}
          >
            {c}
          </CategoryChip>
        ))}
      </div>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <li key={tool.slug}>
            <Link
              to={`/playground/${tool.slug}`}
              className="group flex h-full flex-col overflow-hidden rounded-lg border transition-colors hover:bg-muted/40"
            >
              <div className="aspect-[1200/630] overflow-hidden border-b bg-muted/30">
                <img
                  src={tool.thumbnail}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1 p-4">
                <span className="text-xs text-muted-foreground">
                  {tool.category}
                </span>
                <h2 className="font-semibold group-hover:underline">
                  {tool.name}
                </h2>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {tool.description}
                </p>
                <time
                  dateTime={tool.publishedDate}
                  className="mt-auto pt-2 text-xs text-muted-foreground"
                >
                  {formatDate(new Date(`${tool.publishedDate}T00:00:00+09:00`))}
                </time>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </SectionPage>
  )
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-sm transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
