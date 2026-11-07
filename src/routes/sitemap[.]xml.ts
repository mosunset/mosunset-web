import { createFileRoute } from '@tanstack/react-router'

import { sitemapResponse } from '@/server/feeds'

/** sitemap.xml（中身は src/server/feeds.ts） */
export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () => sitemapResponse(),
    },
  },
})
