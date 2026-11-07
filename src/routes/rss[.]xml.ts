import { createFileRoute } from '@tanstack/react-router'

import { rssResponse } from '@/server/feeds'

/** ブログの RSS フィード（中身は src/server/feeds.ts） */
export const Route = createFileRoute('/rss.xml')({
  server: {
    handlers: {
      GET: () => rssResponse(),
    },
  },
})
