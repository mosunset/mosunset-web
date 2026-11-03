import { createFileRoute } from '@tanstack/react-router'

import { absoluteUrl } from '@/lib/seo'
import { sitemapPaths } from '@/lib/site'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () => {
        const urls = sitemapPaths
          .map((path) => `  <url>\n    <loc>${absoluteUrl(path)}</loc>\n  </url>`)
          .join('\n')
        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`

        return new Response(body, {
          headers: { 'Content-Type': 'application/xml; charset=utf-8' },
        })
      },
    },
  },
})
