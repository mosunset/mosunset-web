import { createFileRoute } from '@tanstack/react-router'

import { absoluteUrl } from '@/lib/seo'

/**
 * AI の学習用のクローラー。Cloudflare の「管理された robots.txt」が断っているものと同じ一覧
 * （2026-11 時点）。あちらを切っても、同じものを断り続けられるように、サイトの側にも書いておく。
 * あちらが付ける Content-Signal の行は Lighthouse が「知らない書き方」として減点するので、ここには書かない
 */
const aiTrainingCrawlers = [
  'Amazonbot',
  'Applebot-Extended',
  'Bytespider',
  'CCBot',
  'ClaudeBot',
  'Diffbot',
  'Google-Extended',
  'GPTBot',
  'omgili',
  'anthropic-ai',
  'Claude-Web',
  'cohere-ai',
  'MistralAI-Training',
  'meta-externalagent',
  'GoogleOther',
  'Baiduspider',
  'PetalBot',
  'AwarioSmartBot',
  'AwarioRssBot',
  'Google-CloudVertexBot',
  'QualifiedBot',
  'Cotoyogi',
  'ICC-Crawler',
  'atlassian-bot',
  'FishBot',
  'BorderxBot',
  'NavuBot',
  'SemrushBot-SWA',
  'WARDBot',
  'magpie-crawler',
  'KimiBot',
  'CitibotSiteCrawler',
]

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () => {
        const body = [
          'User-agent: *',
          'Allow: /',
          '',
          '# AI training crawlers',
          ...aiTrainingCrawlers.map((name) => `User-agent: ${name}`),
          'Disallow: /',
          '',
          `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
          '',
        ].join('\n')

        return new Response(body, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      },
    },
  },
})
