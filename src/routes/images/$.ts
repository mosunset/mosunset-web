import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'

import { IMAGE_KEY_PATTERN } from '@/lib/images'

// R2 に保存した画像を配信する。キーは推測しにくい UUID で、中身は変わらないので長くキャッシュする
export const Route = createFileRoute('/images/$')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const key = params._splat ?? ''
        if (!IMAGE_KEY_PATTERN.test(key)) {
          return new Response('Not Found', { status: 404 })
        }

        const object = await env.IMAGES.get(key)
        if (!object) return new Response('Not Found', { status: 404 })

        const headers = new Headers()
        object.writeHttpMetadata(headers)
        headers.set('etag', object.httpEtag)
        headers.set('cache-control', 'public, max-age=31536000, immutable')
        headers.set('x-content-type-options', 'nosniff')
        // 画像を直接開いたときにスクリプトなどが動かないようにする
        headers.set('content-security-policy', "default-src 'none'; sandbox")
        return new Response(object.body, { headers })
      },
    },
  },
})
