import { createFileRoute } from '@tanstack/react-router'

import { imageResponse } from '@/server/r2'

// R2 に保存した画像を配信する（中身は src/server/r2.ts）
export const Route = createFileRoute('/images/$')({
  server: {
    handlers: {
      GET: ({ params }) => imageResponse(params._splat ?? ''),
    },
  },
})
