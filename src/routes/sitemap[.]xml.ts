import { createFileRoute } from '@tanstack/react-router'
import { desc, eq } from 'drizzle-orm'

import { collections } from '@/lib/collections'
import { contactNav, mainNav } from '@/lib/navigation'
import { playgroundTools } from '@/lib/playground'
import { absoluteUrl } from '@/lib/seo'
import { getDb, schema } from '@/server/db'

/** sitemap.xml に必ず載せる固定ページ（プレイグラウンドのツールも含む） */
const staticPaths = [
  '/',
  ...mainNav.map((i) => i.to),
  contactNav.to,
  ...playgroundTools.map((t) => `/playground/${t.slug}`),
]

type Entry = { path: string; lastmod?: Date }

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const posts = await getDb()
          .select({
            slug: schema.posts.slug,
            updatedAt: schema.posts.updatedAt,
          })
          .from(schema.posts)
          .where(eq(schema.posts.status, 'published'))
          .orderBy(desc(schema.posts.publishedAt))

        const collectionRows = await getDb()
          .select({
            kind: schema.collectionItems.kind,
            slug: schema.collectionItems.slug,
            updatedAt: schema.collectionItems.updatedAt,
          })
          .from(schema.collectionItems)
          .where(eq(schema.collectionItems.published, true))

        const entries: Entry[] = [
          ...staticPaths.map((path) => ({ path })),
          ...posts.map((p) => ({
            path: `/blog/${p.slug}`,
            lastmod: p.updatedAt,
          })),
          ...collectionRows.map((c) => ({
            path: `${collections[c.kind].path}/${c.slug}`,
            lastmod: c.updatedAt,
          })),
        ]

        const urls = entries
          .map(({ path, lastmod }) =>
            [
              '  <url>',
              `    <loc>${absoluteUrl(path)}</loc>`,
              lastmod ? `    <lastmod>${lastmod.toISOString()}</lastmod>` : '',
              '  </url>',
            ]
              .filter(Boolean)
              .join('\n'),
          )
          .join('\n')
        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`

        return new Response(body, {
          headers: { 'Content-Type': 'application/xml; charset=utf-8' },
        })
      },
    },
  },
})
