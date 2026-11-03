import { createFileRoute, Link } from '@tanstack/react-router'

import { SectionPage } from '@/components/section-page'
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
                className="group block py-6"
              >
                {post.publishedAt && (
                  <time
                    dateTime={post.publishedAt.toISOString()}
                    className="text-sm text-muted-foreground"
                  >
                    {formatDate(post.publishedAt)}
                  </time>
                )}
                <h2 className="mt-1 text-xl font-semibold group-hover:underline">
                  {post.title}
                </h2>
                {post.excerpt && (
                  <p className="mt-2 text-muted-foreground">{post.excerpt}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionPage>
  )
}
