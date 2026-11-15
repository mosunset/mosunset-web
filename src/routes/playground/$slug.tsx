import { createFileRoute, notFound } from '@tanstack/react-router'

import { NotFoundPage } from '@/components/common/not-found-page'
import { ToolPage } from '@/components/playground/tool-page'
import { preloadTool } from '@/components/playground/tool-registry'
import { findPlaygroundTool } from '@/lib/playground/tools'
import { seo } from '@/lib/seo'

// プレイグラウンドのツールのページ（全ツールでこの 1 つ）。
// ツールの一覧は src/lib/playground/tools.ts、中身は src/components/playground/tools/<slug>/
export const Route = createFileRoute('/playground/$slug')({
  loader: async ({ params, preload }) => {
    const tool = findPlaygroundTool(params.slug)
    if (!tool) throw notFound()
    await preloadTool(tool.slug, { preload })
  },
  staticData: {
    breadcrumb: (match) => findPlaygroundTool(match.params.slug)?.name,
  },
  head: ({ params }) => {
    const tool = findPlaygroundTool(params.slug)
    return {
      meta: tool
        ? seo({ title: tool.title, description: tool.description })
        : seo({ title: 'ツールが見つかりません', noindex: true }),
    }
  },
  component: ToolRoute,
  notFoundComponent: () => (
    <NotFoundPage
      width="max-w-5xl"
      title="ツールが見つかりません"
      message="URL が間違っているか、ツールがなくなった可能性があります。"
      backTo="/playground"
      backLabel="プレイグラウンドの一覧へ"
    />
  ),
})

function ToolRoute() {
  const { slug } = Route.useParams()
  // loader で、ない slug は見つからないページにしている
  const tool = findPlaygroundTool(slug)
  return tool ? <ToolPage slug={tool.slug} /> : null
}
