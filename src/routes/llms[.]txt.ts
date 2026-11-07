import { createFileRoute } from '@tanstack/react-router'

import { llmsTxtResponse } from '@/server/feeds'

/** AI 向けにサイトの中身をまとめた llms.txt（中身は src/server/feeds.ts） */
export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: () => llmsTxtResponse(),
    },
  },
})
