import { createFileRoute } from '@tanstack/react-router'

import { SectionPage } from '@/components/section-page'
import { getNavItem } from '@/lib/navigation'
import { seo } from '@/lib/seo'
import { listPublishedPosts } from '@/server/posts'

const item = getNavItem('/blog')

const dateFormat = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long' })

export const Route = createFileRoute('/blog')({
  staticData: { breadcrumb: item.title },
  head: () => ({
    meta: seo({ title: item.title, description: item.description }),
  }),
  loader: () => listPublishedPosts(),
  component: Blog,
})

function Blog() {
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
            <li key={post.slug} className="py-6">
              {post.publishedAt && (
                <time
                  dateTime={post.publishedAt.toISOString()}
                  className="text-sm text-muted-foreground"
                >
                  {dateFormat.format(post.publishedAt)}
                </time>
              )}
              <h2 className="mt-1 text-xl font-semibold">{post.title}</h2>
              {post.excerpt && (
                <p className="mt-2 text-muted-foreground">{post.excerpt}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionPage>
  )
}
