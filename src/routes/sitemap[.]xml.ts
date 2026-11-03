import { createFileRoute } from '@tanstack/react-router'
import { contactNav, mainNav } from '@/lib/navigation'
import { absoluteUrl } from '@/lib/seo'

/** sitemap.xml に載せるページ */
const sitemapPaths = ['/', ...mainNav.map((i) => i.to), contactNav.to]

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () => {
        const urls = sitemapPaths
          .map(
            (path) => `  <url>\n    <loc>${absoluteUrl(path)}</loc>\n  </url>`,
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
