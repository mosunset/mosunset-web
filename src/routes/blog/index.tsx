import { createFileRoute, Link } from '@tanstack/react-router'

import { SectionPage } from '@/components/section-page'
import { imageUrl } from '@/lib/collections'
import { formatDate } from '@/lib/format'
import { getNavItem } from '@/lib/navigation'
import { seo } from '@/lib/seo'
import { listPublishedPosts } from '@/server/posts'

const item = getNavItem('/blog')

export const Route = createFileRoute('/blog/')({
  head: () => ({
    meta: seo({ title: item.title, description: item.description }),
  }),
  loader: () => listPublishedPosts(),
  component: BlogIndex,
})

function BlogIndex() {
  const posts = Route.useLoaderData()

  return (
    <SectionPage item={item}>
      {posts.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          まだ記事はありません。
        </p>
      ) : (
        <ul className="divide-y">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                to="/blog/$slug"
                params={{ slug: post.slug }}
                className="group flex gap-4 py-6 sm:gap-6"
              >
                <div className="min-w-0 flex-1">
                  {post.publishedAt && (
                    <time
                      dateTime={post.publishedAt.toISOString()}
                      className="text-sm text-muted-foreground"
                    >
                      {formatDate(post.publishedAt)}
                    </time>
                  )}
                  <h2 className="mt-1 text-lg font-semibold group-hover:underline sm:text-xl">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground sm:text-base">
                      {post.excerpt}
                    </p>
                  )}
                </div>
                {post.coverImageKey && (
                  <img
                    src={imageUrl(post.coverImageKey) ?? ''}
                    alt=""
                    loading="lazy"
                    className="aspect-[4/3] w-24 shrink-0 self-start rounded-md border object-cover sm:w-40"
                  />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionPage>
  )
}
