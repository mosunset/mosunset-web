import { desc, eq } from 'drizzle-orm'

import { collections } from '@/lib/collections'
import { contactNav, mainNav } from '@/lib/navigation'
import { playgroundTools } from '@/lib/playground'
import { absoluteUrl } from '@/lib/seo'
import { site } from '@/lib/site'
import { getDb, schema } from '@/server/db'

// sitemap.xml・rss.xml・llms.txt の中身を作る。src/routes の server route からだけ呼ぶ

const escapeXml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// ---------------------------------------------------------------------------
// sitemap.xml
// ---------------------------------------------------------------------------

/** sitemap.xml に必ず載せる固定ページ（プレイグラウンドのツールも含む） */
const staticPaths = [
  '/',
  ...mainNav.map((i) => i.to),
  contactNav.to,
  ...playgroundTools.map((t) => `/playground/${t.slug}`),
]

type Entry = { path: string; lastmod?: Date }

export async function sitemapResponse() {
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
}

// ---------------------------------------------------------------------------
// rss.xml
// ---------------------------------------------------------------------------

/** ブログの RSS フィード（新しい順に 30 件） */
export async function rssResponse() {
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
}

// ---------------------------------------------------------------------------
// llms.txt
// ---------------------------------------------------------------------------

/**
 * AI のアシスタントや回答エンジン向けに、サイトの中身を Markdown でまとめたもの（llms.txt）。
 * https://llmstxt.org/
 */
export async function llmsTxtResponse() {
  const posts = await getDb()
    .select({
      slug: schema.posts.slug,
      title: schema.posts.title,
      excerpt: schema.posts.excerpt,
    })
    .from(schema.posts)
    .where(eq(schema.posts.status, 'published'))
    .orderBy(desc(schema.posts.publishedAt))

  const link = (title: string, path: string, note?: string) =>
    `- [${title}](${absoluteUrl(path)})${note ? `: ${note}` : ''}`

  const body = [
    `# ${site.name}`,
    '',
    `> ${site.description}`,
    '',
    site.personDescription,
    '',
    '## ページ',
    '',
    link('トップ', '/', 'サイトの紹介と自己紹介'),
    ...mainNav.map((item) => link(item.title, item.to, item.description)),
    '',
    '## ブログ',
    '',
    ...posts.map((p) =>
      link(p.title, `/blog/${p.slug}`, p.excerpt || undefined),
    ),
    '',
    '## プレイグラウンド（ブラウザで動くツール）',
    '',
    ...playgroundTools.map((t) =>
      link(t.name, `/playground/${t.slug}`, t.description),
    ),
    '',
    '## Optional',
    '',
    link('サイトマップ', '/sitemap.xml'),
    link('RSS フィード', '/rss.xml'),
    link(contactNav.title, contactNav.to, contactNav.description),
    '',
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
