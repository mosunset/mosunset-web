import { createFileRoute } from '@tanstack/react-router'
import { desc, eq } from 'drizzle-orm'

import { absoluteUrl } from '@/lib/seo'
import { site } from '@/lib/site'
import { getDb, schema } from '@/server/db'

const escapeXml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** ブログの RSS フィード（新しい順に 30 件） */
export const Route = createFileRoute('/rss.xml')({
  server: {
    handlers: {
      GET: async () => {
        const posts = await getDb()
          .select({
            slug: schema.posts.slug,
            title: schema.posts.title,
            excerpt: schema.posts.excerpt,
            publishedAt: schema.posts.publishedAt,
          })
          .from(schema.posts)
          .where(eq(schema.posts.status, 'published'))
          .orderBy(desc(schema.posts.publishedAt))
          .limit(30)

        const items = posts
          .map((p) => {
            const url = absoluteUrl(`/blog/${p.slug}`)
            return [
              '    <item>',
              `      <title>${escapeXml(p.title)}</title>`,
              `      <link>${url}</link>`,
              `      <guid isPermaLink="true">${url}</guid>`,
              p.excerpt
                ? `      <description>${escapeXml(p.excerpt)}</description>`
                : '',
              p.publishedAt
                ? `      <pubDate>${p.publishedAt.toUTCString()}</pubDate>`
                : '',
              '    </item>',
            ]
              .filter(Boolean)
              .join('\n')
          })
          .join('\n')

        const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(site.name)}</title>
    <link>${absoluteUrl('/blog')}</link>
    <description>${escapeXml(site.description)}</description>
    <language>ja</language>
    <atom:link href="${absoluteUrl('/rss.xml')}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`
        return new Response(body, {
          headers: {
            'Content-Type': 'application/rss+xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      },
    },
  },
})
