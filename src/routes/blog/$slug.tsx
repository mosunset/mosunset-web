import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { imageUrl } from '@/lib/collections'
import { formatDate } from '@/lib/format'
import { absoluteUrl, seo } from '@/lib/seo'
import { getPublishedPost } from '@/server/posts'

export const Route = createFileRoute('/blog/$slug')({
  loader: ({ params }) => getPublishedPost({ data: { slug: params.slug } }),
  staticData: {
    breadcrumb: (match) => match.loaderData?.title,
  },
  head: ({ loaderData }) =>
    loaderData
      ? {
          meta: [
            ...seo({
              title: loaderData.title,
              description: loaderData.excerpt || undefined,
            }),
            { property: 'og:type', content: 'article' },
            ...(loaderData.publishedAt
              ? [
                  {
                    property: 'article:published_time',
                    content: loaderData.publishedAt.toISOString(),
                  },
                ]
              : []),
            {
              property: 'article:modified_time',
              content: loaderData.updatedAt.toISOString(),
            },
            // 表紙があれば SNS のカードにも使う（サイト共通の画像を上書きする）
            ...(loaderData.coverImageKey
              ? [
                  {
                    property: 'og:image',
                    content: absoluteUrl(`/images/${loaderData.coverImageKey}`),
                  },
                  { property: 'og:image:alt', content: loaderData.title },
                  {
                    name: 'twitter:image',
                    content: absoluteUrl(`/images/${loaderData.coverImageKey}`),
                  },
                  { name: 'twitter:card', content: 'summary_large_image' },
                ]
              : []),
          ],
        }
      : { meta: seo({ title: '記事が見つかりません', noindex: true }) },
  component: BlogPost,
  notFoundComponent: () => (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <h1 className="text-3xl font-bold">記事が見つかりません</h1>
      <p className="mt-4 text-muted-foreground">
        削除されたか、URL が間違っている可能性があります。
      </p>
      <Link to="/blog" className="mt-6 inline-block underline">
        記事一覧へ
      </Link>
    </div>
  ),
})

function BlogPost() {
  const post = Route.useLoaderData()

  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-8">
      <header className="border-b pb-6">
        {post.coverImageKey && (
          <img
            src={imageUrl(post.coverImageKey) ?? ''}
            alt=""
            className="mb-6 aspect-[1200/630] w-full rounded-lg border object-cover"
          />
        )}
        {post.publishedAt && (
          <time
            dateTime={post.publishedAt.toISOString()}
            className="text-sm text-muted-foreground"
          >
            {formatDate(post.publishedAt)}
          </time>
        )}
        <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">
          {post.title}
        </h1>
        {post.excerpt && (
          <p className="mt-3 text-lg text-muted-foreground">{post.excerpt}</p>
        )}
      </header>

      <div
        className="prose prose-neutral dark:prose-invert mt-8 max-w-none"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: サーバーで Tiptap の JSON から生成し、危険なリンクを取り除いた HTML
        dangerouslySetInnerHTML={{ __html: post.html }}
      />

      <footer className="mt-12 border-t pt-6">
        <Link
          to="/blog"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          記事一覧へ
        </Link>
      </footer>
    </article>
  )
}
