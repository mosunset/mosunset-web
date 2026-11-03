import { createFileRoute } from '@tanstack/react-router'
import { desc, eq } from 'drizzle-orm'

import { contactNav, mainNav } from '@/lib/navigation'
import { playgroundTools } from '@/lib/playground'
import { absoluteUrl } from '@/lib/seo'
import { site } from '@/lib/site'
import { getDb, schema } from '@/server/db'

/**
 * AI のアシスタントや回答エンジン向けに、サイトの中身を Markdown でまとめたもの（llms.txt）。
 * https://llmstxt.org/
 */
export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: async () => {
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
          link(contactNav.title, contactNav.to, contactNav.description),
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
          '',
        ].join('\n')

        return new Response(body, {
          headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      },
    },
  },
})
