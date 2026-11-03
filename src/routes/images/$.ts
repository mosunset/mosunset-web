import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'

// R2 に保存した画像を配信する。キーは推測しにくい UUID で、中身は変わらないので長くキャッシュする
export const Route = createFileRoute('/images/$')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const key = params._splat ?? ''
        if (!/^[a-z0-9-]+\/[0-9a-f-]{36}\.(jpg|png|webp|gif|avif)$/.test(key)) {
          return new Response('Not Found', { status: 404 })
        }

        const object = await env.IMAGES.get(key)
        if (!object) return new Response('Not Found', { status: 404 })

        const headers = new Headers()
        object.writeHttpMetadata(headers)
        headers.set('etag', object.httpEtag)
        headers.set('cache-control', 'public, max-age=31536000, immutable')
        headers.set('x-content-type-options', 'nosniff')
        return new Response(object.body, { headers })
      },
    },
  },
})
