import { createFileRoute } from '@tanstack/react-router'

/** 古い置き場所（/security.txt）を見に来たときは、正しい場所へ案内する */
export const Route = createFileRoute('/security.txt')({
  server: {
    handlers: {
      GET: () =>
        new Response(null, {
          status: 301,
          headers: { Location: '/.well-known/security.txt' },
        }),
    },
  },
})
