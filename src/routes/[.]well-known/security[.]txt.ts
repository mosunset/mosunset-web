import { createFileRoute } from '@tanstack/react-router'

import { contactNav } from '@/lib/navigation'
import { absoluteUrl } from '@/lib/seo'

/**
 * 脆弱性を見つけた人への連絡先（RFC 9116）。
 * Expires は 1 年以内にする決まりなので、過ぎる前に日付を延ばす
 */
const SECURITY_TXT_EXPIRES = '2027-10-31T23:59:59.000Z'

export const Route = createFileRoute('/.well-known/security.txt')({
  server: {
    handlers: {
      GET: () => {
        const body = [
          '# このサイトのセキュリティ上の問題を見つけたら、お問い合わせフォームから知らせてください。',
          '# If you find a security issue on this site, please report it via the contact form.',
          `Contact: ${absoluteUrl(contactNav.to)}`,
          `Expires: ${SECURITY_TXT_EXPIRES}`,
          'Preferred-Languages: ja, en',
          `Canonical: ${absoluteUrl('/.well-known/security.txt')}`,
          '',
        ].join('\n')

        return new Response(body, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
          },
        })
      },
    },
  },
})
